import fs from 'node:fs';
import path from 'node:path';
import { DataChannelTransport } from './app/transport/data-channel-transport.mjs';
import { TunnelApp } from './app/tunnel-app.mjs';
import { DaemonController } from './app/daemon-controller.mjs';
import { DaemonServer } from './app/daemon-server.mjs';

/** --id <id> を process.argv からパースする。省略時は "default" */
function parseDaemonId(argv: string[]): string {
  const idx = argv.indexOf('--id');
  const id = idx !== -1 && idx + 1 < argv.length ? argv[idx + 1] : 'default';
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error(`Invalid daemon id: ${id} (alphanumeric, hyphen, underscore only)`);
  }
  return id;
}

const DAEMON_ID = parseDaemonId(process.argv);

const VAR_DIR = '.var';
const PID_FILE = path.join(VAR_DIR, `daemon-${DAEMON_ID}.pid`);
const SOCK_FILE = path.join(VAR_DIR, `daemon-${DAEMON_ID}.sock`);

async function main(): Promise<void> {
  // .var/ ディレクトリがなければ作成する
  fs.mkdirSync(VAR_DIR, { recursive: true });

  // stale なソケットファイルを削除
  if (fs.existsSync(SOCK_FILE)) {
    fs.unlinkSync(SOCK_FILE);
  }

  const transport = new DataChannelTransport();
  const app = new TunnelApp(transport);
  const controller = new DaemonController(app);
  const server = new DaemonServer(controller, SOCK_FILE);

  await server.start();

  // PID ファイルを書き込む
  fs.writeFileSync(PID_FILE, String(process.pid), 'utf-8');

  console.log(`Daemon started (id=${DAEMON_ID}, pid=${process.pid}, socket=${SOCK_FILE})`);

  const shutdown = async (): Promise<void> => {
    console.log('Shutting down daemon...');
    try {
      app.close();
      await server.stop();
    } catch {
      // ignore errors during shutdown
    } finally {
      if (fs.existsSync(PID_FILE)) {
        fs.unlinkSync(PID_FILE);
      }
      if (fs.existsSync(SOCK_FILE)) {
        fs.unlinkSync(SOCK_FILE);
      }
      process.exit(0);
    }
  };

  process.on('SIGTERM', () => {
    shutdown().catch(console.error);
  });
  process.on('SIGINT', () => {
    shutdown().catch(console.error);
  });
}

main().catch((err) => {
  console.error('Daemon failed to start:', err);
  process.exit(1);
});
