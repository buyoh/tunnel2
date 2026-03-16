import net from 'node:net';
import { decodeMessage, encodeMessage, MessageType, ProtocolMessage } from './protocol.mjs';
import { IP2PTransport } from './transport/interface.mjs';

const HIGH_WATER_MARK = 1 * 1024 * 1024;

interface ConnectionEntry {
  socket: net.Socket;
  paused: boolean;
  remoteClosing: boolean;
}

/**
 * listen 側のトンネル。
 * ローカル TCP を待ち受け、P2P チャネル上の多重化プロトコルに変換する。
 */
export class TunnelListener {
  private server: net.Server | null = null;
  private connections = new Map<number, ConnectionEntry>();
  private nextConnId = 1;

  constructor(
    private readonly listenPort: number,
    private readonly transport: IP2PTransport,
  ) {}

  start(): void {
    if (this.server) {
      return;
    }

    this.server = net.createServer((socket) => {
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

  handleRawMessage(raw: Buffer): void {
    this.handleMessage(decodeMessage(raw));
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

    if (msg.type === MessageType.CLOSE || msg.type === MessageType.CONNECT_ERR) {
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

  private send(connId: number, type: MessageType, payload: Buffer = Buffer.alloc(0)): void {
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
  ) {}

  handleRawMessage(raw: Buffer): void {
    this.handleMessage(decodeMessage(raw));
  }

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
      this.send(connId, MessageType.CONNECT_ERR, Buffer.from('connId already exists', 'utf-8'));
      return;
    }

    const socket = net.createConnection({ host: this.forwardHost, port: this.forwardPort });

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
        this.send(connId, MessageType.CONNECT_ERR, Buffer.from(error.message, 'utf-8'));
      }
      socket.destroy();
    });
  }

  private send(connId: number, type: MessageType, payload: Buffer = Buffer.alloc(0)): void {
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