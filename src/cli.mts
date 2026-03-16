import readline from 'node:readline/promises';
import { TunnelApp } from './app.mjs';

export async function runCli(app: TunnelApp, args: string[]): Promise<void> {
  const command = args[0];

  setupEventHandlers(app);

  if (command === 'listen') {
    const port = Number(args[1]);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      throw new Error('listen port must be 1-65535');
    }

    await app.listen(port);
    const answer = await promptInput('相手のアンサー情報を貼り付けてください:\n> ');
    await app.setRemoteAnswer(answer);
    return;
  }

  if (command === 'forward') {
    const target = args[1] ?? '';
    const [host, portText] = target.split(':');
    const port = Number(portText);
    if (!host || !Number.isInteger(port) || port <= 0 || port > 65535) {
      throw new Error('forward target must be host:port');
    }

    await app.forward(host, port);
    const offer = await promptInput('相手のオファー情報を貼り付けてください:\n> ');
    await app.setRemoteOffer(offer);
    return;
  }

  printUsage();
}

function setupEventHandlers(app: TunnelApp): void {
  app.on('offer-ready', (encoded: string) => {
    console.log('以下のオファー情報を相手に送ってください:');
    console.log(encoded);
  });

  app.on('answer-ready', (encoded: string) => {
    console.log('以下のアンサー情報を相手に送ってください:');
    console.log(encoded);
  });

  app.on('connected', () => {
    console.log('接続しました');
  });

  app.on('disconnected', () => {
    console.log('切断されました');
  });

  app.on('error', (error: Error) => {
    console.error('エラー:', error.message);
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