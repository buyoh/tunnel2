import express from 'express';
import http from 'node:http';
import { TunnelApp } from './app.mjs';

/** daemon が記録するイベント */
interface DaemonEvent {
  type: string;
  data?: string;
  timestamp: string; // ISO 8601
}

/** 最後に受信したコマンドの記録 */
interface LastCommand {
  action: string;
  ok: boolean;
  error?: string;
  timestamp: string; // ISO 8601
}

/** /api/status で返す daemon の状態。 */
interface StatusResponse {
  state: ReturnType<TunnelApp['getState']>;
  events: DaemonEvent[];
  lastCommand: LastCommand | null;
}

/** コマンド実行結果。 */
interface CommandResponse {
  ok: boolean;
  error?: string;
}

/** HTTP とは独立したコマンド処理・イベント記録を担う。 */
export class DaemonController {
  private readonly events: DaemonEvent[] = [];
  private lastCommand: LastCommand | undefined;

  constructor(private readonly app: TunnelApp) {
    this.setupEventListeners();
  }

  getStatus(): StatusResponse {
    return {
      state: this.app.getState(),
      events: [...this.events],
      lastCommand: this.lastCommand ?? null,
    };
  }

  async executeCommand(action: unknown, args: unknown): Promise<{ status: number; body: CommandResponse }> {
    if (typeof action !== 'string' || action.length === 0) {
      return { status: 400, body: { ok: false, error: 'action is required' } };
    }

    const normalizedArgs = this.normalizeArgs(args);
    if (!normalizedArgs.ok) {
      this.recordLastCommand(action, false, normalizedArgs.error);
      return { status: 400, body: { ok: false, error: normalizedArgs.error } };
    }

    try {
      switch (action) {
        case 'listen':
          await this.app.listen(this.getPortArg(normalizedArgs.value.port, 'listen.port'));
          break;
        case 'forward':
          await this.app.forward(
            this.getHostArg(normalizedArgs.value.host, 'forward.host'),
            this.getPortArg(normalizedArgs.value.port, 'forward.port'),
          );
          break;
        case 'set-remote-offer':
          await this.app.setRemoteOffer(this.getEncodedArg(normalizedArgs.value.encoded, 'set-remote-offer.encoded'));
          break;
        case 'set-remote-answer':
          await this.app.setRemoteAnswer(this.getEncodedArg(normalizedArgs.value.encoded, 'set-remote-answer.encoded'));
          break;
        case 'close':
          this.app.close();
          break;
        default: {
          const error = `unknown action: ${action}`;
          this.recordLastCommand(action, false, error);
          return { status: 400, body: { ok: false, error } };
        }
      }

      this.recordLastCommand(action, true);
      return { status: 200, body: { ok: true } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.recordLastCommand(action, false, message);
      return { status: 400, body: { ok: false, error: message } };
    }
  }

  /** TunnelApp のイベントを購読して内部配列に蓄積する */
  private setupEventListeners(): void {
    const push = (type: string, data?: string): void => {
      if (this.events.length >= MAX_EVENTS) {
        this.events.shift();
      }
      this.events.push({ type, data, timestamp: new Date().toISOString() });
    };

    this.app.on('offer-ready', (encoded: string) => push('offer-ready', encoded));
    this.app.on('answer-ready', (encoded: string) => push('answer-ready', encoded));
    this.app.on('connected', () => push('connected'));
    this.app.on('disconnected', () => push('disconnected'));
    this.app.on('error', (err: Error) => push('error', err.message));
  }

  private recordLastCommand(action: string, ok: boolean, error?: string): void {
    this.lastCommand = { action, ok, error, timestamp: new Date().toISOString() };
  }

  private normalizeArgs(args: unknown): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
    if (args === undefined || args === null) {
      return { ok: true, value: {} };
    }
    if (typeof args !== 'object' || Array.isArray(args)) {
      return { ok: false, error: 'args must be an object' };
    }
    return { ok: true, value: args as Record<string, unknown> };
  }

  private getPortArg(value: unknown, field: string): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 65535) {
      throw new Error(`${field} must be an integer between 1 and 65535`);
    }
    return value;
  }

  private getHostArg(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`${field} must be a non-empty string`);
    }
    return value;
  }

  private getEncodedArg(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`${field} must be a non-empty string`);
    }
    return value;
  }
}

const MAX_EVENTS = 100;

/**
 * TunnelApp をラップし、Unix domain socket 上の HTTP サーバを提供する。
 * bash スクリプトから `curl --unix-socket` でコマンドを受け付ける。
 */
export class DaemonServer {
  private readonly expressApp: express.Application;
  private readonly httpServer: http.Server;

  constructor(
    private readonly controller: DaemonController,
    private readonly socketPath: string,
  ) {
    this.expressApp = express();
    this.httpServer = http.createServer(this.expressApp);
    this.setupRoutes();
  }

  /** Express ルートを設定する */
  private setupRoutes(): void {
    this.expressApp.use(express.json());

    this.expressApp.get('/api/status', (_req, res) => {
      res.json(this.controller.getStatus());
    });

    this.expressApp.post('/api/command', async (req, res) => {
      const body = req.body as { action?: unknown; args?: unknown };
      const result = await this.controller.executeCommand(body.action, body.args);
      res.status(result.status).json(result.body);
    });
  }

  /** サーバを起動して Unix domain socket で listen 開始する */
  start(): Promise<void> {
    return new Promise((resolve) => {
      this.httpServer.listen(this.socketPath, () => {
        resolve();
      });
    });
  }

  /** graceful shutdown */
  stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.httpServer.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}
