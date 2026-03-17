import { parseArgs } from 'node:util';
import readline from 'node:readline/promises';
import { TunnelApp } from './tunnel-app.mjs';

export async function runCli(app: TunnelApp, args: string[]): Promise<void> {
  const { positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {},
  });

  const [command, arg] = positionals;

  setupEventHandlers(app);

  if (command === 'listen') {
    const port = Number(arg);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      throw new Error('listen port must be 1-65535');
    }

    await app.listen(port);
    const answer = await promptInput('Paste the remote answer info:\n> ');
    await app.setRemoteAnswer(answer);
    return;
  }

  if (command === 'forward') {
    const target = arg ?? '';
    const [host, portText] = target.split(':');
    const port = Number(portText);
    if (!host || !Number.isInteger(port) || port <= 0 || port > 65535) {
      throw new Error('forward target must be host:port');
    }

    await app.forward(host, port);
    const offer = await promptInput('Paste the remote offer info:\n> ');
    await app.setRemoteOffer(offer);
    return;
  }

  printUsage();
}

function setupEventHandlers(app: TunnelApp): void {
  app.on('offer-ready', (encoded: string) => {
    console.log('Send the following offer info to the remote peer:');
    console.log(encoded);
  });

  app.on('answer-ready', (encoded: string) => {
    console.log('Send the following answer info to the remote peer:');
    console.log(encoded);
  });

  app.on('connected', () => {
    console.log('Connected');
  });

  app.on('disconnected', () => {
    console.log('Disconnected');
  });

  app.on('error', (error: Error) => {
    console.error('Error:', error.message);
  });
}

async function promptInput(prompt: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    return (await rl.question(prompt)).trim();
  } finally {
    rl.close();
  }
}

function printUsage(): void {
  console.log('Usage:');
  console.log('  tunnel listen <port>');
  console.log('  tunnel forward <host:port>');
}