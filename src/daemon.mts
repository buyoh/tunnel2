import fs from 'node:fs';
import path from 'node:path';
import { DataChannelTransport } from './app/transport/datachannel.mjs';
import { TunnelApp } from './app/app.mjs';
import { DaemonServer } from './app/daemon-server.mjs';

const VAR_DIR = '.var';
const PID_FILE = path.join(VAR_DIR, 'daemon.pid');
const SOCK_FILE = path.join(VAR_DIR, 'daemon.sock');

async function main(): Promise<void> {
  // .var/ ディレクトリがなければ作成する
  fs.mkdirSync(VAR_DIR, { recursive: true });

  // stale なソケットファイルを削除
  if (fs.existsSync(SOCK_FILE)) {
    fs.unlinkSync(SOCK_FILE);
  }

  const transport = new DataChannelTransport();
  const app = new TunnelApp(transport);
  const server = new DaemonServer(app, SOCK_FILE);

  await server.start();

  // PID ファイルを書き込む
  fs.writeFileSync(PID_FILE, String(process.pid), 'utf-8');

  console.log(`Daemon started (pid=${process.pid}, socket=${SOCK_FILE})`);

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
