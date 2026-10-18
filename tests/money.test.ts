import { describe, expect, it } from 'vitest';
import { formatAmount, formatIdr, formatIdrCompact, formatIdrSigned, parseAmountInput } from '@/lib/money';

describe('money', () => {
  it('memformat rupiah dengan pemisah ribuan Indonesia dan spasi setelah Rp', () => {
    expect(formatAmount(25000)).toBe('25.000');
    expect(formatIdr(25000)).toBe('Rp 25.000');
    expect(formatIdr(0)).toBe('Rp 0');
    expect(formatIdr(1234567890)).toBe('Rp 1.234.567.890');
  });

  it('memberi tanda +/− eksplisit', () => {
    expect(formatIdrSigned(5000)).toBe('+Rp 5.000');
    expect(formatIdrSigned(-25000)).toBe('−Rp 25.000');
    expect(formatIdrSigned(0)).toBe('Rp 0');
  });

  it('menangani nominal negatif tanpa tanda ganda', () => {
    expect(formatIdr(-5000)).toBe('−Rp 5.000');
  });

  it('format ringkas untuk grafik', () => {
    expect(formatIdrCompact(1_500_000)).toBe('1,5 jt');
    expect(formatIdrCompact(250_000)).toBe('250 rb');
    expect(formatIdrCompact(9_500)).toBe('9.500');
    expect(formatIdrCompact(2_500_000_000)).toBe('2,5 M');
  });

  it('memparsing input nominal bebas format', () => {
    expect(parseAmountInput('25.000')).toBe(25000);
    expect(parseAmountInput('25000')).toBe(25000);
    expect(parseAmountInput('Rp 25.000')).toBe(25000);
    expect(parseAmountInput('')).toBeNull();
    expect(parseAmountInput('0')).toBeNull();
    expect(parseAmountInput('abc')).toBeNull();
  });
});
