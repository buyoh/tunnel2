import * as net from 'node:net';
import {
  encodeMessage,
  MessageType,
  ProtocolMessage,
} from './protocol-message.mjs';
import {
  ConnectionEntry,
  ITcpClientFactory,
  ITcpSocket,
} from './tcp-socket.mjs';
import { IP2PTransport } from './transport/p2p-transport.mjs';

const HIGH_WATER_MARK = 1 * 1024 * 1024;

/** node:net を使う本番向け TCP クライアントファクトリ。 */
export class NodeTcpClientFactory implements ITcpClientFactory {
  createConnection(options: { host: string; port: number }): ITcpSocket {
    return net.createConnection(options);
  }
}

const DEFAULT_TCP_CLIENT_FACTORY = new NodeTcpClientFactory();

/**
 * forward 側のトンネル。
 * P2P で受信した接続要求をターゲット TCP に中継する。
 */
export class TunnelForwarder {
  private connections = new Map<number, ConnectionEntry>();

  constructor(
    private readonly forwardHost: string,
    private readonly forwardPort: number,
    private readonly transport: IP2PTransport,
    private readonly tcpClientFactory: ITcpClientFactory = DEFAULT_TCP_CLIENT_FACTORY
  ) {}

  handleMessage(msg: ProtocolMessage): void {
    if (msg.type === MessageType.CONNECT) {
      this.handleConnect(msg.connId);
      return;
    }

    const entry = this.connections.get(msg.connId);
    if (!entry) {
      return;
    }

    if (msg.type === MessageType.DATA) {
      entry.socket.write(msg.payload);
      return;
    }

    if (msg.type === MessageType.CLOSE) {
      entry.remoteClosing = true;
      entry.socket.destroy();
      this.connections.delete(msg.connId);
    }
  }

  stop(): void {
    for (const entry of this.connections.values()) {
      entry.remoteClosing = true;
      entry.socket.destroy();
    }
    this.connections.clear();
  }

  onBufferedAmountLow(): void {
    for (const entry of this.connections.values()) {
      if (entry.paused) {
        entry.paused = false;
        entry.socket.resume();
      }
    }
  }

  private handleConnect(connId: number): void {
    if (this.connections.has(connId)) {
      this.send(
        connId,
        MessageType.CONNECT_ERR,
        Buffer.from('connId already exists', 'utf-8')
      );
      return;
    }

    const socket = this.tcpClientFactory.createConnection({
      host: this.forwardHost,
      port: this.forwardPort,
    });

    const entry: ConnectionEntry = {
      socket,
      paused: false,
      remoteClosing: false,
    };
    this.connections.set(connId, entry);

    let connected = false;

    socket.once('connect', () => {
      connected = true;
      this.send(connId, MessageType.CONNECT_ACK);
    });

    socket.on('data', (chunk) => {
      this.send(connId, MessageType.DATA, Buffer.from(chunk));
      this.applyBackpressure(connId);
    });

    socket.on('close', () => {
      const current = this.connections.get(connId);
      if (!current) {
        return;
      }
      this.connections.delete(connId);
      if (!current.remoteClosing) {
        this.send(connId, MessageType.CLOSE);
      }
    });

    socket.on('error', (error) => {
      if (!connected) {
        this.send(
          connId,
          MessageType.CONNECT_ERR,
          Buffer.from(error.message, 'utf-8')
        );
      }
      socket.destroy();
    });
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
