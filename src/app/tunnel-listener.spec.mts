import { EventEmitter } from 'node:events';
import { decodeMessage, MessageType } from './protocol-message.mjs';
import { ITcpServer, ITcpServerFactory, ITcpSocket } from './tcp-socket.mjs';
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

describe('TunnelListener', () => {
  it('sends CONNECT when a TCP connection is accepted', () => {
    const transport = new MockTransport();
    const tcpServer = new MockTcpServer();
    transport.setEvents({
      onOpen: () => {},
      onMessage: () => {},
      onClosed: () => {},
      onStateChange: () => {},
      onBufferedAmountLow: () => {},
    });

    const listener = new TunnelListener(31001, transport, new MockTcpServerFactory(tcpServer));
    listener.start();

    tcpServer.accept(new MockTcpSocket());

    const sent = transport.getSentMessages();
    expect(sent.length).toBeGreaterThan(0);
    const first = decodeMessage(sent[0]);
    expect(first.type).toBe(MessageType.CONNECT);

    listener.stop();
  });
});
