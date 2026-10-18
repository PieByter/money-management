import { describe, expect, it } from 'vitest';
import {
  dayLabel,
  jakartaYmd,
  monthKey,
  monthRangeFromKey,
  monthRangeUtc,
  shiftMonthKey,
} from '@/lib/dates';

describe('dates (Asia/Jakarta)', () => {
  it('menghitung rentang bulan dalam WIB (UTC+7)', () => {
    const { start, end } = monthRangeUtc({ year: 2026, month: 10 });
    expect(start.toISOString()).toBe('2026-09-30T17:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-31T17:00:00.000Z');
  });

  it('transaksi 31 Des 23:59 WIB tidak masuk bulan berikutnya', () => {
    const decRange = monthRangeFromKey('2026-12');
    const lastMinuteWib = new Date('2026-12-31T16:59:00.000Z');
    const firstMinuteNextYear = new Date('2026-12-31T17:00:00.000Z');

    expect(lastMinuteWib >= decRange.start && lastMinuteWib < decRange.end).toBe(true);
    expect(firstMinuteNextYear >= decRange.end).toBe(true);
    expect(jakartaYmd(lastMinuteWib)).toBe('2026-12-31');
    expect(jakartaYmd(firstMinuteNextYear)).toBe('2027-01-01');
  });

  it('menggeser bulan melewati batas tahun', () => {
    expect(shiftMonthKey('2026-01', -1)).toBe('2025-12');
    expect(shiftMonthKey('2026-12', 1)).toBe('2027-01');
    expect(shiftMonthKey('2026-06', -12)).toBe('2025-06');
    expect(monthKey({ year: 2026, month: 3 })).toBe('2026-03');
  });

  it('memberi label relatif hari', () => {
    const now = new Date('2026-10-18T03:00:00.000Z');
    expect(dayLabel('2026-10-18', now)).toBe('Hari ini');
    expect(dayLabel('2026-10-17', now)).toBe('Kemarin');
    expect(dayLabel('2026-10-15', now)).toContain('15');
  });
});
