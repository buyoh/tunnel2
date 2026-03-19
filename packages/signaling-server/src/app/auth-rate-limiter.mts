/** 認証失敗レートリミットの設定値。 */
export interface RateLimitConfig {
  windowMs: number;
  maxPerIp: number;
  maxGlobal: number;
  maxTrackedIps: number;
}

interface Clock {
  now(): number;
}

/** 認証失敗を IP 単位と全体で追跡するレートリミッタ。 */
export class AuthRateLimiter {
  private readonly perIp = new Map<string, number[]>();
  private globalFailures: number[] = [];

  constructor(
    private readonly config: RateLimitConfig,
    private readonly clock: Clock = { now: () => Date.now() },
  ) {}

  isAllowed(ip: string): boolean {
    const now = this.clock.now();
    this.prune(now);

    if (this.globalFailures.length >= this.config.maxGlobal) {
      return false;
    }

    return (this.perIp.get(ip)?.length ?? 0) < this.config.maxPerIp;
  }

  recordFailure(ip: string): void {
    const now = this.clock.now();
    this.prune(now);
    this.globalFailures.push(now);

    if (!this.perIp.has(ip) && this.perIp.size >= this.config.maxTrackedIps) {
      const oldestIp = this.perIp.keys().next().value;
      if (oldestIp) {
        this.perIp.delete(oldestIp);
      }
    }

    const failures = this.perIp.get(ip) ?? [];
    failures.push(now);
    this.perIp.set(ip, failures);
  }

  private prune(now: number): void {
    const minTimestamp = now - this.config.windowMs;
    this.globalFailures = this.globalFailures.filter((timestamp) => timestamp > minTimestamp);

    for (const [ip, failures] of this.perIp.entries()) {
      const active = failures.filter((timestamp) => timestamp > minTimestamp);
      if (active.length === 0) {
        this.perIp.delete(ip);
        continue;
      }
      this.perIp.set(ip, active);
    }
  }
}