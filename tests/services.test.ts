import { randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import type { AppDb } from '@/server/db/client';
import { ensureDefaults } from '@/server/services/defaults';
import {
  createRecommendedWallets,
  createWallet,
  deleteWallet,
  listWallets,
  setWalletArchived,
} from '@/server/services/wallets';
import {
  createTransaction,
  createTransfer,
  deleteTransaction,
  getTransactionDetail,
  ledgerInvariant,
  listTags,
  listTransactions,
  reconcileWallet,
  restoreTransactions,
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
  getTagTotals,
} from '@/server/services/reports';
import {
  getFrequentItems,
  getItemPriceHistory,
  getItemsByTransactions,
  getTransactionItems,
  listItems,
  setTransactionItems,
} from '@/server/services/items';
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

let walletCounter = 0;
/** Nama kantong unik untuk tes (menghindari bentrok dengan kantong rekomendasi seed). */
function uniqueName(base: string): string {
  walletCounter += 1;
  return `${base} uji ${walletCounter}`;
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
    const gopay = await createWallet(db, userId, { name: uniqueName('GoPay'), type: 'ewallet' });

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
    const cash = await createWallet(db, userId, { name: uniqueName('Cash'), type: 'cash' });

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
    const gopay = await createWallet(db, userId, { name: uniqueName('GoPay'), type: 'ewallet' });

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
    const wallet = await createWallet(db, userId, { name: uniqueName('Cash'), type: 'cash' });
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
    const to = await createWallet(db, userId, { name: uniqueName('Cash'), type: 'cash' });
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
    const cash = await createWallet(db, userId, { name: uniqueName('Cash'), type: 'cash' });

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

    // Fee 0 â†’ baris fee dihapus (soft delete).
    await updateTransfer(db, userId, { transactionId: leg!.id, feeAmount: 2_000 });
    expect(await balanceOf(userId, bca.id)).toBe(-352_000);
    await updateTransfer(db, userId, { transactionId: leg!.id, feeAmount: 0 });
    expect(await balanceOf(userId, bca.id)).toBe(-350_000);
  });

  it('hapus transfer menghapus semua baris satu group', async () => {
    const userId = await newUser();
    const bca = await createWallet(db, userId, { name: 'BCA', type: 'bank' });
    const cash = await createWallet(db, userId, { name: uniqueName('Cash'), type: 'cash' });

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

  it('undo hapus: transaksi & transfer kembali utuh beserta saldo', async () => {
    const userId = await newUser();
    const wallet = await createWallet(db, userId, { name: uniqueName('Cash'), type: 'cash' });
    const created = await createTransaction(db, userId, {
      kind: 'expense',
      amount: 75_000,
      walletId: wallet.id,
      occurredAt: wibAt(2026, 10, 9),
    });

    const removal = await deleteTransaction(db, userId, created.id);
    expect(removal.ids).toEqual([created.id]);
    expect(await balanceOf(userId, wallet.id)).toBe(0);

    expect(await restoreTransactions(db, userId, removal.ids)).toBe(1);
    expect(await balanceOf(userId, wallet.id)).toBe(-75_000);
    // Restore dua kali tidak error dan tidak menggandakan.
    expect(await restoreTransactions(db, userId, removal.ids)).toBe(0);

    // Transfer: satu group kembali bersama-sama.
    const bank = await createWallet(db, userId, { name: uniqueName('Bank'), type: 'bank' });
    const { groupId } = await createTransfer(db, userId, {
      fromWalletId: bank.id,
      toWalletId: wallet.id,
      amount: 50_000,
      feeAmount: 1_000,
      occurredAt: wibAt(2026, 10, 10),
    });
    const { items } = await listTransactions(db, userId, {});
    const leg = items.find((item) => item.groupId === groupId && item.kind === 'transfer_out')!;
    const transferRemoval = await deleteTransaction(db, userId, leg.id);
    expect(transferRemoval.ids).toHaveLength(3);
    expect(await balanceOf(userId, bank.id)).toBe(0);

    expect(await restoreTransactions(db, userId, transferRemoval.ids)).toBe(3);
    expect(await balanceOf(userId, bank.id)).toBe(-51_000);
    expect(await balanceOf(userId, wallet.id)).toBe(-25_000);
  });

  it('restore hanya menyentuh baris milik user sendiri', async () => {
    const userId = await newUser();
    const otherUserId = await newUser();
    const wallet = await createWallet(db, userId, { name: uniqueName('Cash'), type: 'cash' });
    const created = await createTransaction(db, userId, {
      kind: 'expense',
      amount: 12_000,
      walletId: wallet.id,
      occurredAt: wibAt(2026, 10, 11),
    });
    const removal = await deleteTransaction(db, userId, created.id);

    expect(await restoreTransactions(db, otherUserId, removal.ids)).toBe(0);
    const { items } = await listTransactions(db, userId, {});
    expect(items).toHaveLength(0);
  });

  it('edit transaksi biasa dan validasi kategori/tipe', async () => {
    const userId = await newUser();
    const wallet = await createWallet(db, userId, { name: uniqueName('Cash'), type: 'cash' });
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
    const wallet = await createWallet(db, userId, { name: uniqueName('Cash'), type: 'cash' });
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
    const wallet = await createWallet(db, userId, { name: uniqueName('Cash'), type: 'cash' });
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

    // Saldo ledger 60.000, riil 55.000 â†’ adjustment_out 5.000.
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
    const wallet = await createWallet(db, userId, { name: uniqueName('Cash'), type: 'cash' });

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
    const wallet = await createWallet(db, userId, { name: uniqueName('Cash'), type: 'cash' });
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
    const wallet = await createWallet(db, userId, { name: uniqueName('Cash'), type: 'cash' });
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
    // Tanpa seed: fokus pada kantong yang dibuat tes ini.
    const userId = randomUUID();
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
    const to = await createWallet(db, userId, { name: uniqueName('Cash'), type: 'cash' });
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
    const wallet = await createWallet(db, userId, { name: uniqueName('Cash'), type: 'cash' });
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
    const wallet = await createWallet(db, userId, { name: uniqueName('Cash'), type: 'cash' });
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

  it('tag: filter tepat, pencarian, daftar tag, dan breakdown laporan', async () => {
    const userId = await newUser();
    const wallet = await createWallet(db, userId, { name: uniqueName('Cash'), type: 'cash' });
    await createTransaction(db, userId, {
      kind: 'expense',
      amount: 40_000,
      walletId: wallet.id,
      note: 'Belanja sayur',
      tags: ['belanja-bulanan', 'dapur'],
      occurredAt: wibAt(2026, 10, 6),
    });
    await createTransaction(db, userId, {
      kind: 'expense',
      amount: 60_000,
      walletId: wallet.id,
      note: 'Bensin',
      tags: ['belanja-bulanan'],
      occurredAt: wibAt(2026, 10, 7),
    });
    await createTransaction(db, userId, {
      kind: 'income',
      amount: 300_000,
      walletId: wallet.id,
      note: 'Bonus',
      tags: ['proyek'],
      occurredAt: wibAt(2026, 10, 8),
    });

    const tagged = await listTransactions(db, userId, { filter: { tag: 'belanja-bulanan' } });
    expect(tagged.items).toHaveLength(2);

    // Filter tag harus persis, bukan pencocokan sebagian.
    const partial = await listTransactions(db, userId, { filter: { tag: 'belanja' } });
    expect(partial.items).toHaveLength(0);

    const searched = await listTransactions(db, userId, { filter: { search: 'dapur' } });
    expect(searched.items).toHaveLength(1);
    expect(searched.items[0].note).toBe('Belanja sayur');

    const tags = await listTags(db, userId);
    expect(tags[0]).toEqual({ tag: 'belanja-bulanan', usage: 2 });

    const totals = await getTagTotals(db, userId, monthRangeFromKey('2026-10'));
    expect(totals.expense.find((row) => row.tag === 'belanja-bulanan')?.total).toBe(100_000);
    expect(totals.income.find((row) => row.tag === 'proyek')?.total).toBe(300_000);
  });
});

describe('seed idempotent & kantong rekomendasi', () => {
  it('ensureDefaults paralel tidak menghasilkan duplikat kategori/kantong', async () => {
    const userId = randomUUID();
    await Promise.all([ensureDefaults(db, userId), ensureDefaults(db, userId), ensureDefaults(db, userId)]);

    const { listCategories } = await import('@/server/services/categories');
    const categories = await listCategories(db, userId, { includeArchived: true });
    const expenseNames = categories.filter((c) => c.kind === 'expense').map((c) => c.name.toLowerCase());
    expect(new Set(expenseNames).size).toBe(expenseNames.length);
    expect(expenseNames.length).toBe(9);

    const wallets = await listWallets(db, userId);
    expect(wallets.length).toBe(8);
    expect(new Set(wallets.map((w) => w.name.toLowerCase())).size).toBe(8);
    expect(wallets.map((w) => w.name)).toContain('OVO');
    expect(wallets.map((w) => w.name)).toContain('ShopeePay');
    expect(wallets.map((w) => w.name)).toContain('Bank Jago');
  });

  it('createRecommendedWallets idempotent', async () => {
    const userId = randomUUID();
    expect(await createRecommendedWallets(db, userId)).toBe(8);
    expect(await createRecommendedWallets(db, userId)).toBe(0);
    expect((await listWallets(db, userId)).length).toBe(8);
  });

  it('menolak kantong duplikat (nama sama, beda huruf besar/kecil)', async () => {
    const userId = await newUser();
    await expect(createWallet(db, userId, { name: 'cash', type: 'cash' })).rejects.toThrow();
  });

  it('nama kantong boleh dipakai lagi setelah dihapus', async () => {
    const userId = randomUUID();
    const first = await createWallet(db, userId, { name: 'Dompet Sementara', type: 'other' });
    expect(await deleteWallet(db, userId, first.id)).toEqual({ deleted: true });
    const second = await createWallet(db, userId, { name: 'Dompet Sementara', type: 'other' });
    expect(second.id).not.toBe(first.id);
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

    const wallet = await createWallet(db, userId, { name: uniqueName('Cash'), type: 'cash' });
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

describe('budget kategori', () => {
  it('menghitung pemakaian bulan berjalan dan menghormati status aktif', async () => {
    const userId = await newUser();
    const { listCategories } = await import('@/server/services/categories');
    const { getBudgetProgress, listBudgets, saveBudget, setBudgetEnabled } = await import(
      '@/server/services/budgets'
    );

    const wallet = await createWallet(db, userId, { name: uniqueName('Cash'), type: 'cash' });
    const categories = await listCategories(db, userId);
    const makan = categories.find((category) => category.name === 'Makan')!;

    await createTransaction(db, userId, {
      kind: 'expense',
      amount: 150_000,
      walletId: wallet.id,
      categoryId: makan.id,
      occurredAt: wibAt(2026, 10, 4),
    });
    // Bulan lain tidak ikut dihitung.
    await createTransaction(db, userId, {
      kind: 'expense',
      amount: 90_000,
      walletId: wallet.id,
      categoryId: makan.id,
      occurredAt: wibAt(2026, 11, 4),
    });

    await saveBudget(db, userId, { categoryId: makan.id, amount: 500_000 });
    const first = await getBudgetProgress(db, userId, '2026-10');
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      limit: 500_000,
      spent: 150_000,
      remaining: 350_000,
      over: false,
    });

    // Simpan ulang mengubah nominal, bukan menambah baris.
    await saveBudget(db, userId, { categoryId: makan.id, amount: 100_000 });
    expect(await listBudgets(db, userId)).toHaveLength(1);
    const tightened = await getBudgetProgress(db, userId, '2026-10');
    expect(tightened[0]).toMatchObject({ limit: 100_000, remaining: -50_000, over: true });

    // Dimatikan: hilang dari dashboard, angkanya tetap tersimpan.
    await setBudgetEnabled(db, userId, makan.id, false);
    expect(await getBudgetProgress(db, userId, '2026-10')).toHaveLength(0);
    expect((await listBudgets(db, userId))[0]).toMatchObject({ amount: 100_000, enabled: false });

    // Menyimpan nominal lagi otomatis menyalakan.
    await saveBudget(db, userId, { categoryId: makan.id, amount: 200_000 });
    expect((await getBudgetProgress(db, userId, '2026-10'))[0]).toMatchObject({
      limit: 200_000,
      spent: 150_000,
    });
  });

  it('menolak kategori pemasukan, kategori user lain, dan toggle tanpa budget', async () => {
    const userId = await newUser();
    const otherUserId = await newUser();
    const { listCategories } = await import('@/server/services/categories');
    const { saveBudget, setBudgetEnabled } = await import('@/server/services/budgets');

    const categories = await listCategories(db, userId);
    const gaji = categories.find((category) => category.kind === 'income')!;
    await expect(saveBudget(db, userId, { categoryId: gaji.id, amount: 10_000 })).rejects.toThrow(
      ServiceError,
    );

    const otherCategories = await listCategories(db, otherUserId);
    const otherMakan = otherCategories.find((category) => category.name === 'Makan')!;
    await expect(
      saveBudget(db, userId, { categoryId: otherMakan.id, amount: 10_000 }),
    ).rejects.toThrow(ServiceError);
    await expect(setBudgetEnabled(db, userId, otherMakan.id, false)).rejects.toThrow(ServiceError);
  });
});

describe('hapus akun', () => {
  it('menghapus seluruh data user tanpa menyentuh data user lain', async () => {
    const userId = await newUser();
    const otherUserId = await newUser();
    const { listCategories } = await import('@/server/services/categories');
    const { listBudgets, saveBudget } = await import('@/server/services/budgets');
    const { wipeUserData } = await import('@/server/services/account');

    const wallet = await createWallet(db, userId, { name: uniqueName('Cash'), type: 'cash' });
    const categories = await listCategories(db, userId);
    const makan = categories.find((category) => category.name === 'Makan')!;
    await createTransaction(db, userId, {
      kind: 'expense',
      amount: 30_000,
      walletId: wallet.id,
      categoryId: makan.id,
      occurredAt: wibAt(2026, 10, 12),
    });
    await saveBudget(db, userId, { categoryId: makan.id, amount: 200_000 });

    const otherWallet = await createWallet(db, otherUserId, { name: uniqueName('Cash'), type: 'cash' });
    await createTransaction(db, otherUserId, {
      kind: 'expense',
      amount: 9_000,
      walletId: otherWallet.id,
      occurredAt: wibAt(2026, 10, 12),
    });

    await wipeUserData(db, userId);

    expect(await listWallets(db, userId, { includeArchived: true })).toHaveLength(0);
    expect(await listCategories(db, userId, { includeArchived: true })).toHaveLength(0);
    expect(await listBudgets(db, userId)).toHaveLength(0);
    expect((await listTransactions(db, userId, {})).items).toHaveLength(0);

    // Data user lain tidak tersentuh.
    expect((await listWallets(db, otherUserId, { includeArchived: true })).length).toBeGreaterThan(0);
    expect((await listTransactions(db, otherUserId, {})).items).toHaveLength(1);
  });
});

describe('katalog item & rincian belanja', () => {
  it('menyimpan rincian item, meng-upsert katalog, dan menghitung harga satuan', async () => {
    const userId = await newUser();
    const wallet = await createWallet(db, userId, { name: uniqueName('Cash'), type: 'cash' });
    const { listCategories } = await import('@/server/services/categories');
    const categories = await listCategories(db, userId);
    const belanja = categories.find((category) => category.name === 'Belanja')!;

    const created = await createTransaction(db, userId, {
      kind: 'expense',
      amount: 100_000,
      walletId: wallet.id,
      categoryId: belanja.id,
      occurredAt: wibAt(2026, 10, 20),
      items: [
        { name: 'Beras 5kg', amount: 70_000 },
        { name: 'Telur', amount: 20_000, qtyMilli: 500 },
      ],
    });

    const lines = await getItemsByTransactions(db, userId, [created.id]);
    expect(lines[created.id]).toHaveLength(2);
    expect(lines[created.id][0]).toMatchObject({ name: 'Beras 5kg', amount: 70_000 });

    // Katalog terbentuk otomatis + kategori default ikut terisi.
    const catalog = await listItems(db, userId);
    expect(catalog.map((item) => item.name).sort()).toEqual(['Beras 5kg', 'Telur']);
    expect(catalog.find((item) => item.name === 'Telur')).toMatchObject({
      lastPrice: 40_000,
      categoryId: belanja.id,
    });

    // Chip cepat: item yang baru dipakai muncul lebih dulu.
    expect((await getFrequentItems(db, userId))[0]?.name).toBeDefined();
  });

  it('mengganti rincian saat edit dan memperbarui harga terakhir di katalog', async () => {
    const userId = await newUser();
    const wallet = await createWallet(db, userId, { name: uniqueName('Cash'), type: 'cash' });
    const created = await createTransaction(db, userId, {
      kind: 'expense',
      amount: 50_000,
      walletId: wallet.id,
      occurredAt: wibAt(2026, 10, 21),
      items: [{ name: 'Kopi', amount: 25_000 }],
    });
    const [kopi] = await listItems(db, userId);
    expect(kopi).toMatchObject({ name: 'Kopi', lastPrice: 25_000 });

    await updateTransaction(db, userId, {
      transactionId: created.id,
      amount: 60_000,
      items: [
        { itemId: kopi.id, name: 'Kopi', amount: 40_000 },
        { name: 'Gula', amount: 15_000 },
      ],
    });

    const lines = await getTransactionItems(db, userId, created.id);
    expect(lines).toHaveLength(2);
    expect((await listItems(db, userId)).find((item) => item.name === 'Kopi')?.lastPrice).toBe(40_000);
  });

  it('menolak rincian yang melebihi nominal dan rincian pada pemasukan', async () => {
    const userId = await newUser();
    const wallet = await createWallet(db, userId, { name: uniqueName('Cash'), type: 'cash' });
    const created = await createTransaction(db, userId, {
      kind: 'expense',
      amount: 10_000,
      walletId: wallet.id,
      occurredAt: wibAt(2026, 10, 22),
    });

    await expect(
      setTransactionItems(db, userId, created.id, [{ name: 'Terlalu mahal', amount: 15_000 }]),
    ).rejects.toThrow(ServiceError);
    // Gagal = tidak ada baris yang tersimpan (satu transaksi DB).
    expect(await getTransactionItems(db, userId, created.id)).toHaveLength(0);

    const income = await createTransaction(db, userId, {
      kind: 'income',
      amount: 20_000,
      walletId: wallet.id,
      occurredAt: wibAt(2026, 10, 22),
    });
    await expect(
      setTransactionItems(db, userId, income.id, [{ name: 'Bonus', amount: 20_000 }]),
    ).rejects.toThrow(ServiceError);
  });

  it('riwayat harga item: urut terbaru, harga satuan dari qty', async () => {
    const userId = await newUser();
    const otherUserId = await newUser();
    const wallet = await createWallet(db, userId, { name: uniqueName('Cash'), type: 'cash' });

    for (const [day, price] of [
      [10, 18_000],
      [20, 21_000],
    ] as const) {
      await createTransaction(db, userId, {
        kind: 'expense',
        amount: price,
        walletId: wallet.id,
        occurredAt: wibAt(2026, 10, day),
        items: [{ name: 'Minyak goreng', amount: price, qtyMilli: 2000 }],
      });
    }
    const [minyak] = await listItems(db, userId);
    const history = await getItemPriceHistory(db, userId, minyak.id);

    expect(history).toHaveLength(2);
    expect(history[0].lineAmount).toBe(21_000);
    expect(history[0].unitPrice).toBe(10_500);
    expect(history[0].walletName).toBeDefined();
    // Riwayat item tidak boleh bocor ke user lain.
    expect(await getItemPriceHistory(db, otherUserId, minyak.id)).toHaveLength(0);
  });

  it('menghapus akun juga membersihkan katalog item dan rinciannya', async () => {
    const userId = await newUser();
    const { wipeUserData } = await import('@/server/services/account');
    const wallet = await createWallet(db, userId, { name: uniqueName('Cash'), type: 'cash' });
    const created = await createTransaction(db, userId, {
      kind: 'expense',
      amount: 30_000,
      walletId: wallet.id,
      occurredAt: wibAt(2026, 10, 23),
      items: [{ name: 'Sabun', amount: 30_000 }],
    });
    expect(await listItems(db, userId)).toHaveLength(1);

    await wipeUserData(db, userId);

    expect(await listItems(db, userId)).toHaveLength(0);
    expect(await getTransactionItems(db, userId, created.id)).toHaveLength(0);
  });
});
