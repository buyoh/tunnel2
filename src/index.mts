import { TunnelApp } from './app/tunnel-app.mjs';
import { runCli } from './app/cli.mjs';
import { DataChannelTransport } from './app/transport/data-channel-transport.mjs';

async function main(): Promise<void> {
  const app = new TunnelApp(new DataChannelTransport());
  await runCli(app, process.argv.slice(2));
}

main().catch((error: unknown) => {
  const err = error instanceof Error ? error : new Error(String(error));
  console.error(err.message);
  process.exitCode = 1;
});
