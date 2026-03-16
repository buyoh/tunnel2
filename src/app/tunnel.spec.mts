import net from 'node:net';
import { decodeMessage, MessageType } from './protocol.mjs';
import { TunnelForwarder, TunnelListener } from './tunnel.mjs';
import { MockTransport } from './transport/mock.mjs';

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const getPort = (server: net.Server): number => {
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to resolve server address');
  }
  return address.port;
};

describe('TunnelListener', () => {
  it('sends CONNECT when a TCP connection is accepted', async () => {
    const transport = new MockTransport();
    transport.setEvents({
      onOpen: () => {},
      onMessage: () => {},
      onClosed: () => {},
      onStateChange: () => {},
      onBufferedAmountLow: () => {},
    });

    const listener = new TunnelListener(31001, transport);
    listener.start();
    await wait(50);

    const client = net.createConnection({ host: '127.0.0.1', port: 31001 });
    await new Promise<void>((resolve) => client.once('connect', () => resolve()));
    await wait(50);

    const sent = transport.getSentMessages();
    expect(sent.length).toBeGreaterThan(0);
    const first = decodeMessage(sent[0]);
    expect(first.type).toBe(MessageType.CONNECT);

    client.destroy();
    listener.stop();
  });
});

describe('Tunnel integration', () => {
  it('forwards TCP data via paired MockTransport', async () => {
    const echoServer = net.createServer((socket) => {
      socket.on('data', (chunk) => {
        socket.write(Buffer.concat([Buffer.from('echo:'), chunk]));
      });
    });

    await new Promise<void>((resolve) => echoServer.listen(0, '127.0.0.1', () => resolve()));
    const echoPort = getPort(echoServer);

    const [a, b] = MockTransport.createPair();
    const listener = new TunnelListener(31002, a);
    const forwarder = new TunnelForwarder('127.0.0.1', echoPort, b);

    a.setEvents({
      onOpen: () => {},
      onMessage: (raw) => listener.handleRawMessage(raw),
      onClosed: () => {},
      onStateChange: () => {},
      onBufferedAmountLow: () => listener.onBufferedAmountLow(),
    });
    b.setEvents({
      onOpen: () => {},
      onMessage: (raw) => forwarder.handleRawMessage(raw),
      onClosed: () => {},
      onStateChange: () => {},
      onBufferedAmountLow: () => forwarder.onBufferedAmountLow(),
    });

    listener.start();
    await wait(50);

    const client = net.createConnection({ host: '127.0.0.1', port: 31002 });
    await new Promise<void>((resolve) => client.once('connect', () => resolve()));

    client.write('ping');

    const data = await new Promise<Buffer>((resolve) => {
      client.once('data', (chunk) => resolve(Buffer.from(chunk)));
    });

    expect(data.toString('utf-8')).toBe('echo:ping');

    client.destroy();
    listener.stop();
    forwarder.stop();
    await new Promise<void>((resolve, reject) => echoServer.close((error) => (error ? reject(error) : resolve())));
  });
});