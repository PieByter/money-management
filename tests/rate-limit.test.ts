import { describe, expect, it } from 'vitest';
import { checkRateLimit, resetRateLimit } from '@/lib/rate-limit';

describe('rate limit', () => {
  it('membatasi jumlah aksi dalam jendela waktu', () => {
    resetRateLimit('uji');
    const now = 1_000_000;
    expect(checkRateLimit('uji', 2, 60_000, now)).toMatchObject({ ok: true, remaining: 1 });
    expect(checkRateLimit('uji', 2, 60_000, now + 10)).toMatchObject({ ok: true, remaining: 0 });
    const blocked = checkRateLimit('uji', 2, 60_000, now + 20);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBe(59_980);
  });

  it('mengizinkan lagi setelah jendela berakhir', () => {
    resetRateLimit('uji-2');
    const now = 2_000_000;
    expect(checkRateLimit('uji-2', 1, 1_000, now).ok).toBe(true);
    expect(checkRateLimit('uji-2', 1, 1_000, now + 500).ok).toBe(false);
    expect(checkRateLimit('uji-2', 1, 1_000, now + 1_001).ok).toBe(true);
  });
});
