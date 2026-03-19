import { EventEmitter } from 'node:events';
import { decodeMessage } from './protocol-message.mjs';
import {
  ITcpClientFactory,
  ITcpServer,
  ITcpServerFactory,
  ITcpSocket,
} from './tcp-socket.mjs';
import { TunnelForwarder } from './tunnel-forwarder.mjs';
import { TunnelListener } from './tunnel-listener.mjs';
import { MockTransport } from './transport/mock-transport.mjs';

class MockTcpSocket extends EventEmitter implements ITcpSocket {
  readonly writes: Buffer[] = [];
  private closed = false;

  write(data: Buffer): boolean {
    this.writes.push(Buffer.from(data));
    return true;
  }

  destroy(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.emit('close');
  }

  pause(): void {
    // no-op
  }

  resume(): void {
    // no-op
  }

  emitData(data: Buffer): void {
    this.emit('data', Buffer.from(data));
  }

  emitConnect(): void {
    this.emit('connect');
  }
}

class MockTcpServer implements ITcpServer {
  private handler: ((socket: ITcpSocket) => void) | null = null;

  setConnectionHandler(handler: (socket: ITcpSocket) => void): void {
    this.handler = handler;
  }

  accept(socket: ITcpSocket): void {
    if (!this.handler) {
      throw new Error('Connection handler is not set');
    }
    this.handler(socket);
  }

  listen(_port: number, _host: string): void {
    // no-op
  }

  close(): void {
    // no-op
  }
}

class MockTcpServerFactory implements ITcpServerFactory {
  constructor(private readonly server: MockTcpServer) {}

  createServer(connectionHandler: (socket: ITcpSocket) => void): ITcpServer {
    this.server.setConnectionHandler(connectionHandler);
    return this.server;
  }
}

class MockTcpClientFactory implements ITcpClientFactory {
  private readonly sockets: MockTcpSocket[] = [];

  enqueueSocket(socket: MockTcpSocket): void {
    this.sockets.push(socket);
  }

  createConnection(_options: { host: string; port: number }): ITcpSocket {
    const socket = this.sockets.shift();
    if (!socket) {
      throw new Error('No queued socket');
    }
    return socket;
  }
}

describe('TunnelForwarder integration', () => {
  it('forwards TCP data via paired MockTransport and mock TCP sockets', () => {
    const [a, b] = MockTransport.createPair();
    const tcpServer = new MockTcpServer();
    const tcpClientFactory = new MockTcpClientFactory();
    const targetSocket = new MockTcpSocket();
    tcpClientFactory.enqueueSocket(targetSocket);

    const listener = new TunnelListener(
      31002,
      a,
      new MockTcpServerFactory(tcpServer)
    );
    const forwarder = new TunnelForwarder(
      '127.0.0.1',
      18080,
      b,
      tcpClientFactory
    );

    a.setEvents({
      onOpen: () => {},
      onMessage: (raw) => listener.handleMessage(decodeMessage(raw)),
      onClosed: () => {},
      onStateChange: () => {},
      onBufferedAmountLow: () => listener.onBufferedAmountLow(),
    });
    b.setEvents({
      onOpen: () => {},
      onMessage: (raw) => forwarder.handleMessage(decodeMessage(raw)),
      onClosed: () => {},
      onStateChange: () => {},
      onBufferedAmountLow: () => forwarder.onBufferedAmountLow(),
    });

    listener.start();
    const localClient = new MockTcpSocket();
    tcpServer.accept(localClient);
    targetSocket.emitConnect();

    localClient.emitData(Buffer.from('ping'));
    expect(targetSocket.writes.map((item) => item.toString('utf-8'))).toContain(
      'ping'
    );

    targetSocket.emitData(Buffer.from('echo:ping'));
    expect(localClient.writes.map((item) => item.toString('utf-8'))).toContain(
      'echo:ping'
    );

    listener.stop();
    forwarder.stop();
  });
});
