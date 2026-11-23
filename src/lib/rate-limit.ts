/**
 * Rate limit in-memory sederhana (sliding fixed window). Cukup untuk aplikasi
 * personal dan mencegah double-submit/abuse ringan. Di serverless, batas
 * berlaku per instance; untuk skala lebih besar ganti dengan Redis/Upstash.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
}

const globalStore = globalThis as unknown as { __moneyRateLimits?: Map<string, Bucket> };

function store(): Map<string, Bucket> {
  if (!globalStore.__moneyRateLimits) globalStore.__moneyRateLimits = new Map();
  return globalStore.__moneyRateLimits;
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): RateLimitResult {
  const buckets = store();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: Math.max(limit - 1, 0), retryAfterMs: 0 };
  }
  if (current.count >= limit) {
    return { ok: false, remaining: 0, retryAfterMs: current.resetAt - now };
  }
  current.count += 1;
  return { ok: true, remaining: Math.max(limit - current.count, 0), retryAfterMs: 0 };
}

export function resetRateLimit(key?: string): void {
  if (key) store().delete(key);
  else store().clear();
}

export function rateLimitMessage(retryAfterMs: number): string {
  const seconds = Math.max(Math.ceil(retryAfterMs / 1000), 1);
  return `Terlalu banyak permintaan. Coba lagi dalam ${seconds} detik.`;
}
