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

const MAX_EVENTS = 100;

/**
 * TunnelApp をラップし、Unix domain socket 上の HTTP サーバを提供する。
 * bash スクリプトから `curl --unix-socket` でコマンドを受け付ける。
 */
export class DaemonServer {
  private readonly expressApp: express.Application;
  private readonly httpServer: http.Server;
  private readonly events: DaemonEvent[] = [];
  private lastCommand: LastCommand | undefined;

  constructor(
    private readonly app: TunnelApp,
    private readonly socketPath: string,
  ) {
    this.expressApp = express();
    this.httpServer = http.createServer(this.expressApp);
    this.setupEventListeners();
    this.setupRoutes();
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

  /** Express ルートを設定する */
  private setupRoutes(): void {
    this.expressApp.use(express.json());

    this.expressApp.get('/api/status', (req, res) => {
      this.handleStatus(req, res);
    });

    this.expressApp.post('/api/command', async (req, res) => {
      await this.handleCommand(req, res);
    });
  }

  /** GET /api/status — 現在の状態・イベント履歴・最終コマンドを返す */
  private handleStatus(_req: express.Request, res: express.Response): void {
    res.json({
      state: this.app.getState(),
      events: this.events,
      lastCommand: this.lastCommand ?? null,
    });
  }

  /** POST /api/command — TunnelApp のメソッドを呼び出す */
  private async handleCommand(req: express.Request, res: express.Response): Promise<void> {
    const body = req.body as { action?: string; args?: Record<string, unknown> };
    const action = body.action;
    const args = body.args ?? {};

    if (!action) {
      res.status(400).json({ ok: false, error: 'action is required' });
      return;
    }

    try {
      switch (action) {
        case 'listen':
          await this.app.listen(args.port as number);
          break;
        case 'forward':
          await this.app.forward(args.host as string, args.port as number);
          break;
        case 'set-remote-offer':
          await this.app.setRemoteOffer(args.encoded as string);
          break;
        case 'set-remote-answer':
          await this.app.setRemoteAnswer(args.encoded as string);
          break;
        case 'close':
          this.app.close();
          break;
        default:
          res.status(400).json({ ok: false, error: `unknown action: ${action}` });
          this.lastCommand = { action, ok: false, error: `unknown action: ${action}`, timestamp: new Date().toISOString() };
          return;
      }

      this.lastCommand = { action, ok: true, timestamp: new Date().toISOString() };
      res.status(200).json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.lastCommand = { action, ok: false, error: message, timestamp: new Date().toISOString() };
      res.status(400).json({ ok: false, error: message });
    }
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
