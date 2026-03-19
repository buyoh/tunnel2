import * as net from 'node:net';
import {
  encodeMessage,
  MessageType,
  ProtocolMessage,
} from './protocol-message.mjs';
import {
  ConnectionEntry,
  ITcpServer,
  ITcpServerFactory,
  ITcpSocket,
} from './tcp-socket.mjs';
import { IP2PTransport } from './transport/p2p-transport.mjs';

const HIGH_WATER_MARK = 1 * 1024 * 1024;

/** node:net を使う本番向け TCP サーバファクトリ。 */
export class NodeTcpServerFactory implements ITcpServerFactory {
  createServer(connectionHandler: (socket: ITcpSocket) => void): ITcpServer {
    return net.createServer((socket) => {
      connectionHandler(socket);
    });
  }
}

const DEFAULT_TCP_SERVER_FACTORY = new NodeTcpServerFactory();

/**
 * listen 側のトンネル。
 * ローカル TCP を待ち受け、P2P チャネル上の多重化プロトコルに変換する。
 */
export class TunnelListener {
  private server: ITcpServer | null = null;
  private connections = new Map<number, ConnectionEntry>();
  private nextConnId = 1;

  constructor(
    private readonly listenPort: number,
    private readonly transport: IP2PTransport,
    private readonly tcpServerFactory: ITcpServerFactory = DEFAULT_TCP_SERVER_FACTORY
  ) {}

  start(): void {
    if (this.server) {
      return;
    }

    this.server = this.tcpServerFactory.createServer((socket) => {
      const connId = this.nextConnId;
      this.nextConnId += 1;

      this.connections.set(connId, {
        socket,
        paused: false,
        remoteClosing: false,
      });

      this.send(connId, MessageType.CONNECT);

      socket.on('data', (chunk) => {
        this.send(connId, MessageType.DATA, Buffer.from(chunk));
        this.applyBackpressure(connId);
      });

      socket.on('close', () => {
        const entry = this.connections.get(connId);
        if (!entry) {
          return;
        }
        this.connections.delete(connId);
        if (!entry.remoteClosing) {
          this.send(connId, MessageType.CLOSE);
        }
      });

      socket.on('error', () => {
        socket.destroy();
      });
    });

    this.server.listen(this.listenPort, '127.0.0.1');
  }

  stop(): void {
    for (const entry of this.connections.values()) {
      entry.remoteClosing = true;
      entry.socket.destroy();
    }
    this.connections.clear();

    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  handleMessage(msg: ProtocolMessage): void {
    const entry = this.connections.get(msg.connId);
    if (!entry) {
      return;
    }

    if (msg.type === MessageType.DATA) {
      entry.socket.write(msg.payload);
      return;
    }

    if (
      msg.type === MessageType.CLOSE ||
      msg.type === MessageType.CONNECT_ERR
    ) {
      entry.remoteClosing = true;
      entry.socket.destroy();
      this.connections.delete(msg.connId);
    }
  }

  onBufferedAmountLow(): void {
    for (const entry of this.connections.values()) {
      if (entry.paused) {
        entry.paused = false;
        entry.socket.resume();
      }
    }
  }

  private send(
    connId: number,
    type: MessageType,
    payload: Buffer = Buffer.alloc(0)
  ): void {
    this.transport.sendMessage(encodeMessage({ connId, type, payload }));
  }

  private applyBackpressure(connId: number): void {
    const entry = this.connections.get(connId);
    if (!entry || entry.paused) {
      return;
    }
    if (this.transport.bufferedAmount() > HIGH_WATER_MARK) {
      entry.paused = true;
      entry.socket.pause();
    }
  }
}
