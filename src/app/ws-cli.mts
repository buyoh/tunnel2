import { parseArgs } from 'node:util';
import { TunnelApp } from './tunnel-app.mjs';
import { DataChannelTransport } from './transport/data-channel-transport.mjs';
import { WsSignaling } from './ws-signaling.mjs';

/** WebSocket シグナリングを使う CLI エントリポイント。 */
export async function runWsCli(args: string[]): Promise<void> {
  const { positionals, values } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      server: { type: 'string' },
      key: { type: 'string' },
      pubkey: { type: 'string' },
      room: { type: 'string' },
      port: { type: 'string' },
      target: { type: 'string' },
    },
  });

  const [command] = positionals;
  const serverUrl = values.server ?? '';
  const privateKeyPath = values.key ?? '';
  const publicKeyPath = values.pubkey ?? '';
  const room = values.room ?? '';

  if (!serverUrl || !privateKeyPath || !publicKeyPath || !room) {
    printUsage();
    throw new Error('server, key, pubkey and room are required');
  }

  const signaling =
    command === 'ws-listen'
      ? createListenClient(
          serverUrl,
          privateKeyPath,
          publicKeyPath,
          room,
          values.port ?? ''
        )
      : command === 'ws-forward'
        ? createForwardClient(
            serverUrl,
            privateKeyPath,
            publicKeyPath,
            room,
            values.target ?? ''
          )
        : null;

  if (!signaling) {
    printUsage();
    return;
  }

  signaling.on('error', (error: Error) => {
    console.error('Error:', error.message);
  });

  const stop = (): void => {
    signaling.stop();
  };

  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  signaling.start();
}

function createListenClient(
  serverUrl: string,
  privateKeyPath: string,
  publicKeyPath: string,
  room: string,
  portText: string
): WsSignaling {
  const port = Number(portText);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('port must be 1-65535');
  }

  return new WsSignaling(
    {
      create: () => {
        const transport = new DataChannelTransport();
        return { app: new TunnelApp(transport), transport };
      },
    },
    {
      serverUrl,
      privateKeyPath,
      publicKeyPath,
      mode: 'listen',
      room,
      listenPort: port,
    }
  );
}

function createForwardClient(
  serverUrl: string,
  privateKeyPath: string,
  publicKeyPath: string,
  room: string,
  target: string
): WsSignaling {
  const [host, portText] = target.split(':');
  const port = Number(portText);
  if (!host || !Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('target must be host:port');
  }

  return new WsSignaling(
    {
      create: () => {
        const transport = new DataChannelTransport();
        return { app: new TunnelApp(transport), transport };
      },
    },
    {
      serverUrl,
      privateKeyPath,
      publicKeyPath,
      mode: 'forward',
      room,
      targetHost: host,
      targetPort: port,
    }
  );
}

function printUsage(): void {
  console.log('Usage:');
  console.log(
    '  tunnel ws-listen --server <url> --key <private_key_path> --pubkey <public_key_path> --room <name> --port <port>'
  );
  console.log(
    '  tunnel ws-forward --server <url> --key <private_key_path> --pubkey <public_key_path> --room <name> --target <host:port>'
  );
}
