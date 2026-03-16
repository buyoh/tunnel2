import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { DaemonServer } from './daemon-server.mjs';
import { TunnelApp } from './app.mjs';
import { MockTransport } from './transport/mock.mjs';

const TMP_DIR = path.resolve('.trash/tmp/daemon-server-test');

/** Unix domain socket でリクエストを送信するヘルパー */
function request(sockPath: string, method: string, urlPath: string, body?: unknown): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined;
    const req = http.request(
      {
        socketPath: sockPath,
        method,
        path: urlPath,
        headers: {
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk: Buffer) => {
          raw += chunk.toString();
        });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode ?? 0, body: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode ?? 0, body: raw });
          }
        });
      },
    );
    req.on('error', reject);
    if (data) {
      req.write(data);
    }
    req.end();
  });
}

describe('DaemonServer', () => {
  let server: DaemonServer;
  let app: TunnelApp;
  let sockPath: string;

  beforeEach(async () => {
    fs.mkdirSync(TMP_DIR, { recursive: true });
    sockPath = path.join(TMP_DIR, `daemon-${Date.now()}.sock`);
    const transport = new MockTransport();
    app = new TunnelApp(transport);
    server = new DaemonServer(app, sockPath);
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
    if (fs.existsSync(sockPath)) {
      fs.unlinkSync(sockPath);
    }
  });

  describe('GET /api/status', () => {
    it('初期状態で idle を返す', async () => {
      const res = await request(sockPath, 'GET', '/api/status');

      expect(res.status).toBe(200);
      const body = res.body as { state: string; events: unknown[]; lastCommand: unknown };
      expect(body.state).toBe('idle');
      expect(body.events).toEqual([]);
      expect(body.lastCommand).toBeNull();
    });
  });

  describe('POST /api/command', () => {
    it('action なしは 400 を返す', async () => {
      const res = await request(sockPath, 'POST', '/api/command', {});

      expect(res.status).toBe(400);
      const body = res.body as { ok: boolean; error: string };
      expect(body.ok).toBe(false);
    });

    it('不明な action は 400 を返す', async () => {
      const res = await request(sockPath, 'POST', '/api/command', { action: 'no-such-action', args: {} });

      expect(res.status).toBe(400);
      const body = res.body as { ok: boolean; error: string };
      expect(body.ok).toBe(false);
      expect(body.error).toContain('unknown action');
    });

    it('listen コマンドが成功し 200 を返す', async () => {
      const res = await request(sockPath, 'POST', '/api/command', { action: 'listen', args: { port: 19999 } });

      expect(res.status).toBe(200);
      const body = res.body as { ok: boolean };
      expect(body.ok).toBe(true);
    });

    it('listen 後のステータスに offer-ready イベントが含まれる', async () => {
      await request(sockPath, 'POST', '/api/command', { action: 'listen', args: { port: 19998 } });

      const res = await request(sockPath, 'GET', '/api/status');
      const body = res.body as { state: string; events: Array<{ type: string }> };
      const eventTypes = body.events.map((e) => e.type);
      expect(eventTypes).toContain('offer-ready');
    });

    it('不正な状態への listen は 400 を返す', async () => {
      // 既に listening 状態にする
      await request(sockPath, 'POST', '/api/command', { action: 'listen', args: { port: 19997 } });

      const res = await request(sockPath, 'POST', '/api/command', { action: 'listen', args: { port: 19996 } });
      expect(res.status).toBe(400);
      const body = res.body as { ok: boolean };
      expect(body.ok).toBe(false);
    });

    it('forward コマンドが成功し 200 を返す', async () => {
      const res = await request(sockPath, 'POST', '/api/command', {
        action: 'forward',
        args: { host: 'localhost', port: 9999 },
      });

      expect(res.status).toBe(200);
      const body = res.body as { ok: boolean };
      expect(body.ok).toBe(true);
    });

    it('close コマンドが成功し 200 を返す', async () => {
      const res = await request(sockPath, 'POST', '/api/command', { action: 'close', args: {} });

      expect(res.status).toBe(200);
      const body = res.body as { ok: boolean };
      expect(body.ok).toBe(true);
    });

    it('lastCommand がコマンド後に更新される', async () => {
      await request(sockPath, 'POST', '/api/command', { action: 'close', args: {} });

      const res = await request(sockPath, 'GET', '/api/status');
      const body = res.body as { lastCommand: { action: string; ok: boolean } };
      expect(body.lastCommand).not.toBeNull();
      expect(body.lastCommand.action).toBe('close');
      expect(body.lastCommand.ok).toBe(true);
    });
  });
});
