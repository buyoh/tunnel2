import { TunnelApp } from './app/tunnel-app.mjs';
import { runCli } from './app/cli.mjs';
import { DataChannelTransport } from './app/transport/data-channel-transport.mjs';
import { runWsCli } from './app/ws-cli.mjs';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const [command] = args;

  if (command === 'ws-listen' || command === 'ws-forward') {
    await runWsCli(args);
    return;
  }

  const app = new TunnelApp(new DataChannelTransport());
  await runCli(app, args);
}

main().catch((error: unknown) => {
  const err = error instanceof Error ? error : new Error(String(error));
  console.error(err.message);
  process.exitCode = 1;
});
