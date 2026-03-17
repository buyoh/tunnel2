import { DaemonController } from './daemon-controller.mjs';
import { TunnelApp } from './tunnel-app.mjs';
import { MockTransport } from './transport/mock-transport.mjs';

describe('DaemonController', () => {
  let controller: DaemonController;
  let app: TunnelApp;

  beforeEach(() => {
    const transport = new MockTransport();
    app = new TunnelApp(transport);
    controller = new DaemonController(app);
  });

  describe('getStatus', () => {
    it('初期状態で idle を返す', async () => {
      const status = controller.getStatus();

      expect(status.state).toBe('idle');
      expect(status.events).toEqual([]);
      expect(status.lastCommand).toBeNull();
    });
  });

  describe('executeCommand', () => {
    it('action なしは 400 を返す', async () => {
      const res = await controller.executeCommand(undefined, {});

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
    });

    it('不明な action は 400 を返す', async () => {
      const res = await controller.executeCommand('no-such-action', {});

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toContain('unknown action');
    });

    it('listen コマンドが成功し 200 を返す', async () => {
      const res = await controller.executeCommand('listen', { port: 19999 });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('listen 後のステータスに offer-ready イベントが含まれる', async () => {
      await controller.executeCommand('listen', { port: 19998 });

      const status = controller.getStatus();
      const eventTypes = status.events.map((e) => e.type);
      expect(eventTypes).toContain('offer-ready');
    });

    it('不正な状態への listen は 400 を返す', async () => {
      await controller.executeCommand('listen', { port: 19997 });

      const res = await controller.executeCommand('listen', { port: 19996 });
      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
    });

    it('forward コマンドが成功し 200 を返す', async () => {
      const res = await controller.executeCommand('forward', { host: 'localhost', port: 9999 });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('close コマンドが成功し 200 を返す', async () => {
      const res = await controller.executeCommand('close', {});

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('lastCommand がコマンド後に更新される', async () => {
      await controller.executeCommand('close', {});

      const status = controller.getStatus();
      expect(status.lastCommand).not.toBeNull();
      expect(status.lastCommand?.action).toBe('close');
      expect(status.lastCommand?.ok).toBe(true);
    });

    it('listen の不正 port を 400 で弾く', async () => {
      const res = await controller.executeCommand('listen', { port: 70000 });

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toContain('listen.port');
    });
  });
});
