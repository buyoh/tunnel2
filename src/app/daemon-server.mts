import express from 'express';
import http from 'node:http';
import { DaemonController } from './daemon-controller.mjs';

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
