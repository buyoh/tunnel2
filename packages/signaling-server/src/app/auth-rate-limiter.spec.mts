import { AuthRateLimiter } from './auth-rate-limiter.mjs';

describe('AuthRateLimiter', () => {
  it('IP 単位の失敗回数が上限に達すると拒否する', () => {
    let now = 0;
    const limiter = new AuthRateLimiter(
      {
        windowMs: 60_000,
        maxPerIp: 2,
        maxGlobal: 10,
        maxTrackedIps: 10,
      },
      { now: () => now },
    );

    limiter.recordFailure('127.0.0.1');
    limiter.recordFailure('127.0.0.1');

    expect(limiter.isAllowed('127.0.0.1')).toBe(false);

    now = 60_001;
    expect(limiter.isAllowed('127.0.0.1')).toBe(true);
  });

  it('全体失敗数が上限に達すると別 IP も拒否する', () => {
    const limiter = new AuthRateLimiter(
      {
        windowMs: 60_000,
        maxPerIp: 5,
        maxGlobal: 2,
        maxTrackedIps: 10,
      },
      { now: () => 1_000 },
    );

    limiter.recordFailure('10.0.0.1');
    limiter.recordFailure('10.0.0.2');

    expect(limiter.isAllowed('10.0.0.3')).toBe(false);
  });

  it('追跡 IP 上限を超えると最古の IP を削除する', () => {
    let now = 0;
    const limiter = new AuthRateLimiter(
      {
        windowMs: 60_000,
        maxPerIp: 1,
        maxGlobal: 10,
        maxTrackedIps: 2,
      },
      { now: () => now },
    );

    limiter.recordFailure('10.0.0.1');
    now += 1;
    limiter.recordFailure('10.0.0.2');
    now += 1;
    limiter.recordFailure('10.0.0.3');

    expect(limiter.isAllowed('10.0.0.1')).toBe(true);
    expect(limiter.isAllowed('10.0.0.2')).toBe(false);
    expect(limiter.isAllowed('10.0.0.3')).toBe(false);
  });
});