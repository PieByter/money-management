import { randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AppDb } from '@/server/db/client';
import {
  matchCategory,
  matchWallet,
  normalizeReceiptDate,
  normalizeReceiptPayload,
  parseIdrAmount,
} from '@/lib/receipt';
import { listCategories } from '@/server/services/categories';
import { ensureDefaults } from '@/server/services/defaults';
import { createTransaction } from '@/server/services/transactions';
import { listWallets } from '@/server/services/wallets';

const TODAY = '2026-11-05';

const CATEGORIES = [
  { id: 'cat-makan', name: 'Makan' },
  { id: 'cat-belanja', name: 'Belanja' },
  { id: 'cat-transport', name: 'Transport' },
];

const WALLETS = [
  { id: 'wallet-gopay', name: 'GoPay', type: 'ewallet' },
  { id: 'wallet-cash', name: 'Cash', type: 'cash' },
  { id: 'wallet-bca', name: 'BCA', type: 'bank' },
];

describe('parseIdrAmount', () => {
  it('membaca format rupiah Indonesia', () => {
    expect(parseIdrAmount(25000)).toBe(25000);
    expect(parseIdrAmount('Rp 25.000')).toBe(25000);
    expect(parseIdrAmount('25.000,00')).toBe(25000);
    expect(parseIdrAmount('25,000.00')).toBe(25000);
    expect(parseIdrAmount('1.234.567')).toBe(1234567);
    expect(parseIdrAmount('25000.4')).toBe(25000);
  });

  it('menolak nilai kosong atau tidak masuk akal', () => {
    expect(parseIdrAmount(0)).toBeNull();
    expect(parseIdrAmount(-5000)).toBeNull();
    expect(parseIdrAmount('Rp 0')).toBeNull();
    expect(parseIdrAmount('abc')).toBeNull();
    expect(parseIdrAmount(null)).toBeNull();
  });
});

describe('normalizeReceiptDate', () => {
  it('mendukung format ISO dan Indonesia', () => {
    expect(normalizeReceiptDate('2026-11-05', TODAY)).toBe('2026-11-05');
    expect(normalizeReceiptDate('05/11/2026', TODAY)).toBe('2026-11-05');
    expect(normalizeReceiptDate('05-11-26', TODAY)).toBe('2026-11-05');
    expect(normalizeReceiptDate('5 Nov 2026', TODAY)).toBe('2026-11-05');
    expect(normalizeReceiptDate('November 5, 2026', TODAY)).toBe('2026-11-05');
  });

  it('mengisi tahun yang kosong dan menangani struk tahun lalu', () => {
    expect(normalizeReceiptDate('5 November', TODAY)).toBe('2026-11-05');
    expect(normalizeReceiptDate('31/12', TODAY)).toBe('2025-12-31');
  });

  it('menolak tanggal tidak valid', () => {
    expect(normalizeReceiptDate('31/02/2026', TODAY)).toBeNull();
    expect(normalizeReceiptDate('bukan tanggal', TODAY)).toBeNull();
    expect(normalizeReceiptDate(null, TODAY)).toBeNull();
  });
});

describe('matchCategory', () => {
  it('mencocokkan nama persis dan alias umum', () => {
    expect(matchCategory('makan', CATEGORIES)?.id).toBe('cat-makan');
    expect(matchCategory('makanan & minuman', CATEGORIES)?.id).toBe('cat-makan');
    expect(matchCategory('Indomaret', CATEGORIES)?.id).toBe('cat-belanja');
    expect(matchCategory('parkir', CATEGORIES)?.id).toBe('cat-transport');
  });

  it('mengembalikan null bila tidak yakin', () => {
    expect(matchCategory('foo bar', CATEGORIES)).toBeNull();
    expect(matchCategory(null, CATEGORIES)).toBeNull();
  });
});

describe('matchWallet', () => {
  it('mencocokkan nama kantong dan tipe cash', () => {
    expect(matchWallet('QRIS GoPay', WALLETS)?.id).toBe('wallet-gopay');
    expect(matchWallet('BCA debit', WALLETS)?.id).toBe('wallet-bca');
    expect(matchWallet('TUNAI', WALLETS)?.id).toBe('wallet-cash');
  });

  it('tidak memaksa kantong bila metode tidak dikenal', () => {
    expect(matchWallet('QRIS', WALLETS)).toBeNull();
  });
});

describe('normalizeReceiptPayload', () => {
  const baseOptions = {
    todayYmd: TODAY,
    categories: CATEGORIES,
    wallets: WALLETS,
    provider: 'gemini' as const,
    model: 'gemini-3.8-flash',
    now: new Date('2026-11-05T10:00:00Z'),
  };

  it('menghasilkan draft form yang lengkap', () => {
    const result = normalizeReceiptPayload(
      {
        is_receipt: true,
        merchant: 'Indomaret',
        date: '05/11/2026',
        total: 'Rp 55.000',
        category: 'Belanja',
        payment_method: 'GoPay',
        items: [
          { name: 'Susu', qty: 2, amount: 30000 },
          { name: 'Roti', qty: 1, amount: 15000 },
        ],
        confidence: 'high',
        warnings: [],
      },
      baseOptions,
    );

    expect(result.isReceipt).toBe(true);
    expect(result.total).toBe(55000);
    expect(result.dateYmd).toBe('2026-11-05');
    expect(result.categoryId).toBe('cat-belanja');
    expect(result.walletId).toBe('wallet-gopay');
    expect(result.items).toHaveLength(2);
    expect(result.note).toBe('Struk Indomaret');
    expect(result.warnings).toEqual([]);
    expect(result.rawInput.length).toBeLessThanOrEqual(4000);
    const raw = JSON.parse(result.rawInput) as Record<string, unknown>;
    expect(raw.provider).toBe('gemini');
    expect(raw).not.toHaveProperty('image');
  });

  it('membuang rincian item yang totalnya melebihi struk', () => {
    const result = normalizeReceiptPayload(
      {
        is_receipt: true,
        merchant: 'Toko',
        date: '2026-11-05',
        total: 20000,
        category: 'Belanja',
        items: [{ name: 'Barang', qty: 1, amount: 30000 }],
        confidence: 'medium',
        warnings: [],
      },
      baseOptions,
    );

    expect(result.items).toEqual([]);
    expect(result.warnings.join(' ')).toContain('Rincian item diabaikan');
  });

  it('menandai gambar yang bukan struk', () => {
    const result = normalizeReceiptPayload(
      { is_receipt: false, total: 0, confidence: 'low' },
      baseOptions,
    );

    expect(result.isReceipt).toBe(false);
    expect(result.total).toBeNull();
    expect(result.warnings.join(' ')).toContain('bukan struk');
  });
});

describe('transaksi hasil scan', () => {
  let db: AppDb;
  let client: PGlite;

  beforeAll(async () => {
    const created = await (await import('./helpers/db')).createTestDb();
    db = created.db;
    client = created.client;
  });

  afterAll(async () => {
    await client.close();
  });

  it('menyimpan source receipt dan raw_input', async () => {
    const userId = randomUUID();
    await ensureDefaults(db, userId);
    const [wallets, categories] = await Promise.all([
      listWallets(db, userId),
      listCategories(db, userId, { kind: 'expense' }),
    ]);

    const row = await createTransaction(db, userId, {
      kind: 'expense',
      amount: 55000,
      walletId: wallets[0].id,
      categoryId: categories[0].id,
      occurredAt: new Date('2026-11-05T05:00:00Z'),
      note: 'Struk Indomaret',
      source: 'receipt',
      rawInput: '{"v":1,"provider":"gemini"}',
    });

    expect(row.source).toBe('receipt');
    expect(row.rawInput).toBe('{"v":1,"provider":"gemini"}');
  });
});
