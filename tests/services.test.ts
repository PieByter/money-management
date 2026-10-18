import { randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import type { AppDb } from '@/server/db/client';
import { ensureDefaults } from '@/server/services/defaults';
import { createWallet, deleteWallet, listWallets, setWalletArchived } from '@/server/services/wallets';
import {
  createTransaction,
  createTransfer,
  deleteTransaction,
  getTransactionDetail,
  ledgerInvariant,
  listTransactions,
  reconcileWallet,
  ServiceError,
  updateTransaction,
  updateTransfer,
} from '@/server/services/transactions';
import {
  getAssetOverview,
  getCategoryTotals,
  getDailyTotals,
  getMonthSummary,
  getMonthlyTrend,
} from '@/server/services/reports';
import { monthRangeFromKey } from '@/lib/dates';

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

async function newUser(): Promise<string> {
  const userId = randomUUID();
  await ensureDefaults(db, userId);
  return userId;
}

async function balanceOf(userId: string, walletId: string): Promise<number> {
  const wallets = await listWallets(db, userId);
  return wallets.find((wallet) => wallet.id === walletId)?.balance ?? 0;
}

const WIB = 7 * 60 * 60 * 1000;

function wibAt(year: number, month: number, day: number, hour = 12, minute = 0): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - WIB);
}

describe('ledger transaksi', () => {
  it('pemasukan menambah saldo dan masuk laporan bulan', async () => {
    const userId = await newUser();
    const bca = await createWallet(db, userId, { name: 'BCA', type: 'bank' });

    await createTransaction(db, userId, {
      kind: 'income',
      amount: 5_000_000,
      walletId: bca.id,
      occurredAt: wibAt(2026, 10, 5),
      note: 'Gaji',
    });

    expect(await balanceOf(userId, bca.id)).toBe(5_000_000);
    const summary = await getMonthSummary(db, userId, '2026-10');
    expect(summary).toEqual({ income: 5_000_000, expense: 0, net: 5_000_000 });
  });

  it('pengeluaran mengurangi saldo', async () => {
    const userId = await newUser();
    const gopay = await createWallet(db, userId, { name: 'GoPay', type: 'ewallet' });

    await createTransaction(db, userId, {
      kind: 'income',
      amount: 200_000,
      walletId: gopay.id,
      occurredAt: wibAt(2026, 10, 2),
    });
    await createTransaction(db, userId, {
      kind: 'expense',
      amount: 25_000,
      walletId: gopay.id,
      occurredAt: wibAt(2026, 10, 2),
      note: 'Makan siang',
    });

    expect(await balanceOf(userId, gopay.id)).toBe(175_000);
    const summary = await getMonthSummary(db, userId, '2026-10');
    expect(summary).toEqual({ income: 200_000, expense: 25_000, net: 175_000 });
  });

  it('transfer tidak dihitung sebagai pemasukan/pengeluaran', async () => {
    const userId = await newUser();
    const bca = await createWallet(db, userId, { name: 'BCA', type: 'bank' });
    const cash = await createWallet(db, userId, { name: 'Cash', type: 'cash' });

    await createTransaction(db, userId, {
      kind: 'income',
      amount: 5_000_000,
      walletId: bca.id,
      occurredAt: wibAt(2026, 10, 1),
    });
    await createTransfer(db, userId, {
      fromWalletId: bca.id,
      toWalletId: cash.id,
      amount: 500_000,
      occurredAt: wibAt(2026, 10, 3),
    });

    expect(await balanceOf(userId, bca.id)).toBe(4_500_000);
    expect(await balanceOf(userId, cash.id)).toBe(500_000);
    // Laporan tidak terpengaruh transfer.
    const summary = await getMonthSummary(db, userId, '2026-10');
    expect(summary).toEqual({ income: 5_000_000, expense: 0, net: 5_000_000 });
  });

  it('transfer dengan biaya admin: fee jadi expense terpisah di group yang sama', async () => {
    const userId = await newUser();
    const bca = await createWallet(db, userId, { name: 'BCA', type: 'bank' });
    const gopay = await createWallet(db, userId, { name: 'GoPay', type: 'ewallet' });

    await createTransaction(db, userId, {
      kind: 'income',
      amount: 1_000_000,
      walletId: bca.id,
      occurredAt: wibAt(2026, 10, 1),
    });
    const { groupId } = await createTransfer(db, userId, {
      fromWalletId: bca.id,
      toWalletId: gopay.id,
      amount: 200_000,
      feeAmount: 1_000,
      occurredAt: wibAt(2026, 10, 3),
    });

    expect(await balanceOf(userId, bca.id)).toBe(799_000);
    expect(await balanceOf(userId, gopay.id)).toBe(200_000);

    const { items } = await listTransactions(db, userId, {});
    const groupRows = items.filter((item) => item.groupId === groupId);
    expect(groupRows).toHaveLength(3);
    expect(groupRows.map((row) => row.kind).sort()).toEqual([
      'expense',
      'transfer_in',
      'transfer_out',
    ]);

    const summary = await getMonthSummary(db, userId, '2026-10');
    expect(summary.expense).toBe(1_000); // hanya biaya admin
  });

  it('idempotensi: client_request_id yang sama tidak menghasilkan transaksi ganda', async () => {
    const userId = await newUser();
    const wallet = await createWallet(db, userId, { name: 'Cash', type: 'cash' });
    const clientRequestId = randomUUID();

    const first = await createTransaction(db, userId, {
      kind: 'expense',
      amount: 30_000,
      walletId: wallet.id,
      occurredAt: wibAt(2026, 10, 4),
      clientRequestId,
    });
    const second = await createTransaction(db, userId, {
      kind: 'expense',
      amount: 30_000,
      walletId: wallet.id,
      occurredAt: wibAt(2026, 10, 4),
      clientRequestId,
    });

    expect(second.id).toBe(first.id);
    const { items } = await listTransactions(db, userId, {});
    expect(items).toHaveLength(1);
  });

  it('idempotensi transfer: retry tidak menggandakan leg', async () => {
    const userId = await newUser();
    const from = await createWallet(db, userId, { name: 'BCA', type: 'bank' });
    const to = await createWallet(db, userId, { name: 'Cash', type: 'cash' });
    const clientRequestId = randomUUID();

    const first = await createTransfer(db, userId, {
      fromWalletId: from.id,
      toWalletId: to.id,
      amount: 100_000,
      occurredAt: wibAt(2026, 10, 5),
      clientRequestId,
    });
    const second = await createTransfer(db, userId, {
      fromWalletId: from.id,
      toWalletId: to.id,
      amount: 100_000,
      occurredAt: wibAt(2026, 10, 5),
      clientRequestId,
    });

    expect(second.groupId).toBe(first.groupId);
    expect(await balanceOf(userId, from.id)).toBe(-100_000);
    const { items } = await listTransactions(db, userId, {});
    expect(items).toHaveLength(2);
  });

  it('edit transfer mengubah kedua leg secara atomik', async () => {
    const userId = await newUser();
    const bca = await createWallet(db, userId, { name: 'BCA', type: 'bank' });
    const cash = await createWallet(db, userId, { name: 'Cash', type: 'cash' });

    const { groupId } = await createTransfer(db, userId, {
      fromWalletId: bca.id,
      toWalletId: cash.id,
      amount: 500_000,
      occurredAt: wibAt(2026, 10, 3),
    });

    const { items } = await listTransactions(db, userId, {});
    const leg = items.find((item) => item.groupId === groupId);
    await updateTransfer(db, userId, { transactionId: leg!.id, amount: 350_000 });

    expect(await balanceOf(userId, bca.id)).toBe(-350_000);
    expect(await balanceOf(userId, cash.id)).toBe(350_000);

    // Fee 0 → baris fee dihapus (soft delete).
    await updateTransfer(db, userId, { transactionId: leg!.id, feeAmount: 2_000 });
    expect(await balanceOf(userId, bca.id)).toBe(-352_000);
    await updateTransfer(db, userId, { transactionId: leg!.id, feeAmount: 0 });
    expect(await balanceOf(userId, bca.id)).toBe(-350_000);
  });

  it('hapus transfer menghapus semua baris satu group', async () => {
    const userId = await newUser();
    const bca = await createWallet(db, userId, { name: 'BCA', type: 'bank' });
    const cash = await createWallet(db, userId, { name: 'Cash', type: 'cash' });

    const { groupId } = await createTransfer(db, userId, {
      fromWalletId: bca.id,
      toWalletId: cash.id,
      amount: 100_000,
      feeAmount: 500,
      occurredAt: wibAt(2026, 10, 3),
    });
    const { items } = await listTransactions(db, userId, {});
    const leg = items.find((item) => item.groupId === groupId && item.kind === 'transfer_out');

    await deleteTransaction(db, userId, leg!.id);

    expect(await balanceOf(userId, bca.id)).toBe(0);
    expect(await balanceOf(userId, cash.id)).toBe(0);
    const { items: remaining } = await listTransactions(db, userId, {});
    expect(remaining).toHaveLength(0);
  });

  it('edit transaksi biasa dan validasi kategori/tipe', async () => {
    const userId = await newUser();
    const wallet = await createWallet(db, userId, { name: 'Cash', type: 'cash' });
    const created = await createTransaction(db, userId, {
      kind: 'expense',
      amount: 10_000,
      walletId: wallet.id,
      occurredAt: wibAt(2026, 10, 6),
    });

    const updated = await updateTransaction(db, userId, {
      transactionId: created.id,
      amount: 15_000,
      note: 'Koreksi',
    });
    expect(updated.amount).toBe(15_000);
    expect(updated.note).toBe('Koreksi');
    expect(await balanceOf(userId, wallet.id)).toBe(-15_000);

    // Kategori income tidak boleh dipakai untuk expense.
    const { listCategories } = await import('@/server/services/categories');
    const incomeCategory = (await listCategories(db, userId, { kind: 'income' }))[0];
    await expect(
      createTransaction(db, userId, {
        kind: 'expense',
        amount: 5_000,
        walletId: wallet.id,
        categoryId: incomeCategory.id,
        occurredAt: wibAt(2026, 10, 6),
      }),
    ).rejects.toThrow(ServiceError);
  });

  it('menolak transaksi ke kantong arsip', async () => {
    const userId = await newUser();
    const wallet = await createWallet(db, userId, { name: 'Lama', type: 'other' });
    await setWalletArchived(db, userId, wallet.id, true);

    await expect(
      createTransaction(db, userId, {
        kind: 'income',
        amount: 1_000,
        walletId: wallet.id,
        occurredAt: wibAt(2026, 10, 7),
      }),
    ).rejects.toThrow(ServiceError);
  });

  it('kantong dengan transaksi tidak bisa dihapus, hanya diarsipkan', async () => {
    const userId = await newUser();
    const wallet = await createWallet(db, userId, { name: 'Cash', type: 'cash' });
    await createTransaction(db, userId, {
      kind: 'income',
      amount: 1_000,
      walletId: wallet.id,
      occurredAt: wibAt(2026, 10, 7),
    });

    const result = await deleteWallet(db, userId, wallet.id);
    expect(result).toEqual({ deleted: false, reason: 'has_transactions' });
  });

  it('saldo awal kantong dicatat sebagai adjustment', async () => {
    const userId = await newUser();
    const wallet = await createWallet(db, userId, {
      name: 'Dompet',
      type: 'cash',
      openingBalance: 150_000,
    });

    expect(await balanceOf(userId, wallet.id)).toBe(150_000);
    const { items } = await listTransactions(db, userId, {});
    expect(items[0].kind).toBe('adjustment_in');
    expect(items[0].note).toBe('Saldo awal');
  });
});

describe('rekonsiliasi', () => {
  it('membuat adjustment sesuai selisih dan menjaga invariant', async () => {
    const userId = await newUser();
    const wallet = await createWallet(db, userId, { name: 'Cash', type: 'cash' });
    await createTransaction(db, userId, {
      kind: 'income',
      amount: 100_000,
      walletId: wallet.id,
      occurredAt: wibAt(2026, 10, 1),
    });
    await createTransaction(db, userId, {
      kind: 'expense',
      amount: 40_000,
      walletId: wallet.id,
      occurredAt: wibAt(2026, 10, 2),
    });

    // Saldo ledger 60.000, riil 55.000 → adjustment_out 5.000.
    const result = await reconcileWallet(db, userId, { walletId: wallet.id, actualBalance: 55_000 });
    expect(result.diff).toBe(-5_000);
    expect(result.transactionId).not.toBeNull();
    expect(await balanceOf(userId, wallet.id)).toBe(55_000);

    // Rekonsiliasi kedua tanpa selisih tidak membuat transaksi.
    const second = await reconcileWallet(db, userId, { walletId: wallet.id, actualBalance: 55_000 });
    expect(second.diff).toBe(0);
    expect(second.transactionId).toBeNull();

    const invariant = await ledgerInvariant(db, userId);
    expect(invariant.totalBalances).toBe(invariant.expected);
  });
});

describe('batas bulan WIB dan laporan', () => {
  it('31 Des 23:30 WIB masuk Desember; 01:30 WIB 1 Jan masuk Januari', async () => {
    const userId = await newUser();
    const wallet = await createWallet(db, userId, { name: 'Cash', type: 'cash' });

    await createTransaction(db, userId, {
      kind: 'expense',
      amount: 10_000,
      walletId: wallet.id,
      occurredAt: new Date('2026-12-31T16:30:00.000Z'), // 23:30 WIB
      note: 'Malam tahun baru',
    });
    await createTransaction(db, userId, {
      kind: 'expense',
      amount: 20_000,
      walletId: wallet.id,
      occurredAt: new Date('2026-12-31T18:30:00.000Z'), // 01:30 WIB 1 Jan
      note: 'Dini hari',
    });

    expect((await getMonthSummary(db, userId, '2026-12')).expense).toBe(10_000);
    expect((await getMonthSummary(db, userId, '2027-01')).expense).toBe(20_000);
  });

  it('tren harian dikelompokkan per hari WIB', async () => {
    const userId = await newUser();
    const wallet = await createWallet(db, userId, { name: 'Cash', type: 'cash' });
    await createTransaction(db, userId, {
      kind: 'expense',
      amount: 15_000,
      walletId: wallet.id,
      occurredAt: new Date('2026-10-10T16:59:00.000Z'), // 23:59 WIB 10 Okt
    });
    await createTransaction(db, userId, {
      kind: 'expense',
      amount: 25_000,
      walletId: wallet.id,
      occurredAt: new Date('2026-10-10T17:01:00.000Z'), // 00:01 WIB 11 Okt
    });

    const range = monthRangeFromKey('2026-10');
    const daily = await getDailyTotals(db, userId, range);
    expect(daily.find((d) => d.ymd === '2026-10-10')?.expense).toBe(15_000);
    expect(daily.find((d) => d.ymd === '2026-10-11')?.expense).toBe(25_000);
  });

  it('breakdown kategori dan tren bulanan', async () => {
    const userId = await newUser();
    const wallet = await createWallet(db, userId, { name: 'Cash', type: 'cash' });
    const { listCategories } = await import('@/server/services/categories');
    const makan = (await listCategories(db, userId, { kind: 'expense' })).find(
      (c) => c.name === 'Makan',
    );

    await createTransaction(db, userId, {
      kind: 'expense',
      amount: 25_000,
      walletId: wallet.id,
      categoryId: makan!.id,
      occurredAt: wibAt(2026, 10, 5),
    });
    await createTransaction(db, userId, {
      kind: 'income',
      amount: 1_000_000,
      walletId: wallet.id,
      occurredAt: wibAt(2026, 9, 20),
    });

    const totals = await getCategoryTotals(db, userId, monthRangeFromKey('2026-10'));
    expect(totals.expense).toHaveLength(1);
    expect(totals.expense[0]).toMatchObject({ name: 'Makan', total: 25_000 });

    const trend = await getMonthlyTrend(db, userId, { endMonth: '2026-10', months: 3 });
    expect(trend.map((point) => point.month)).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(trend[1].income).toBe(1_000_000);
    expect(trend[2].expense).toBe(25_000);
  });

  it('overview aset = jumlah saldo kantong aktif', async () => {
    const userId = await newUser();
    const a = await createWallet(db, userId, { name: 'A', type: 'cash', openingBalance: 10_000 });
    const b = await createWallet(db, userId, { name: 'B', type: 'bank', openingBalance: 5_000 });
    const c = await createWallet(db, userId, { name: 'C', type: 'other' });
    await setWalletArchived(db, userId, c.id, true);
    void a;
    void b;

    const overview = await getAssetOverview(db, userId);
    expect(overview.total).toBe(15_000);
    expect(overview.wallets).toHaveLength(2);
  });

  it('invariant ledger tetap benar setelah rangkaian transaksi acak', async () => {
    const userId = await newUser();
    const wallets = [
      await createWallet(db, userId, { name: 'A', type: 'cash' }),
      await createWallet(db, userId, { name: 'B', type: 'bank' }),
      await createWallet(db, userId, { name: 'C', type: 'ewallet' }),
    ];

    for (let i = 0; i < 40; i += 1) {
      const wallet = wallets[i % wallets.length];
      const kind = i % 3 === 0 ? 'income' : 'expense';
      await createTransaction(db, userId, {
        kind,
        amount: (i + 1) * 1_000,
        walletId: wallet.id,
        occurredAt: wibAt(2026, 10, (i % 28) + 1),
      });
      if (i % 5 === 0) {
        const from = wallets[i % wallets.length];
        const to = wallets[(i + 1) % wallets.length];
        await createTransfer(db, userId, {
          fromWalletId: from.id,
          toWalletId: to.id,
          amount: (i + 1) * 100,
          occurredAt: wibAt(2026, 10, (i % 28) + 1),
        });
      }
    }

    await reconcileWallet(db, userId, { walletId: wallets[0].id, actualBalance: 1_234 });
    const invariant = await ledgerInvariant(db, userId);
    expect(invariant.totalBalances).toBe(invariant.expected);
  });

  it('detail transaksi transfer mengembalikan kedua sisi + fee', async () => {
    const userId = await newUser();
    const from = await createWallet(db, userId, { name: 'BCA', type: 'bank' });
    const to = await createWallet(db, userId, { name: 'Cash', type: 'cash' });
    await createTransfer(db, userId, {
      fromWalletId: from.id,
      toWalletId: to.id,
      amount: 250_000,
      feeAmount: 2_500,
      occurredAt: wibAt(2026, 10, 8),
      note: 'Tarik tunai',
    });

    const { items } = await listTransactions(db, userId, {});
    const leg = items.find((item) => item.kind === 'transfer_out');
    const detail = await getTransactionDetail(db, userId, leg!.id);

    expect(detail?.transfer).toMatchObject({
      fromWalletId: from.id,
      toWalletId: to.id,
      amount: 250_000,
      feeAmount: 2_500,
      note: 'Tarik tunai',
    });
  });

  it('filter riwayat: bulan, jenis, dan pencarian', async () => {
    const userId = await newUser();
    const wallet = await createWallet(db, userId, { name: 'Cash', type: 'cash' });
    await createTransaction(db, userId, {
      kind: 'expense',
      amount: 25_000,
      walletId: wallet.id,
      note: 'Makan siang',
      occurredAt: wibAt(2026, 10, 5),
    });
    await createTransaction(db, userId, {
      kind: 'income',
      amount: 500_000,
      walletId: wallet.id,
      note: 'Jual barang',
      occurredAt: wibAt(2026, 11, 5),
    });

    const october = await listTransactions(db, userId, {
      filter: { month: '2026-10' },
    });
    expect(october.items).toHaveLength(1);

    const incomeOnly = await listTransactions(db, userId, { filter: { kind: 'income' } });
    expect(incomeOnly.items).toHaveLength(1);
    expect(incomeOnly.items[0].note).toBe('Jual barang');

    const search = await listTransactions(db, userId, { filter: { search: 'makan' } });
    expect(search.items).toHaveLength(1);
    expect(search.items[0].note).toBe('Makan siang');
  });

  it('paginasi cursor tidak mengembalikan baris ganda', async () => {
    const userId = await newUser();
    const wallet = await createWallet(db, userId, { name: 'Cash', type: 'cash' });
    for (let i = 0; i < 7; i += 1) {
      await createTransaction(db, userId, {
        kind: 'expense',
        amount: 1_000 + i,
        walletId: wallet.id,
        occurredAt: wibAt(2026, 10, i + 1, 10, i),
      });
    }

    const first = await listTransactions(db, userId, { limit: 3 });
    expect(first.items).toHaveLength(3);
    expect(first.nextCursor).not.toBeNull();

    const second = await listTransactions(db, userId, {
      limit: 3,
      cursor: first.nextCursor,
    });
    const ids = new Set([...first.items, ...second.items].map((item) => item.id));
    expect(ids.size).toBe(6);
  });
});

describe('kategori', () => {
  it('seed default berjalan sekali dan kategori terpakai tidak bisa dihapus', async () => {
    const userId = await newUser();
    const { listCategories, deleteCategory } = await import('@/server/services/categories');
    await ensureDefaults(db, userId);
    const first = await listCategories(db, userId);
    expect(first.length).toBeGreaterThan(10);
    await ensureDefaults(db, userId);
    expect((await listCategories(db, userId)).length).toBe(first.length);

    const wallet = await createWallet(db, userId, { name: 'Cash', type: 'cash' });
    const makan = first.find((c) => c.name === 'Makan');
    await createTransaction(db, userId, {
      kind: 'expense',
      amount: 1_000,
      walletId: wallet.id,
      categoryId: makan!.id,
      occurredAt: wibAt(2026, 10, 1),
    });
    expect(await deleteCategory(db, userId, makan!.id)).toEqual({
      deleted: false,
      reason: 'in_use',
    });
  });
});
