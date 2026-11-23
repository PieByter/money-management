import { randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AppDb } from '@/server/db/client';
import { createTransaction, listTransactions } from '@/server/services/transactions';
import { createWallet, listWallets } from '@/server/services/wallets';
import { createGoal, listGoals } from '@/server/services/goals';
import { exportBackup, restoreBackup } from '@/server/services/backup';
import { importTransactions } from '@/server/services/imports';

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

describe('backup dan restore', () => {
  it('ekspor lalu restore mengembalikan saldo dan relasi', async () => {
    const userId = randomUUID();
    const wallet = await createWallet(db, userId, { name: 'Bank Backup', type: 'bank' });
    await createTransaction(db, userId, {
      kind: 'income',
      amount: 1_000_000,
      walletId: wallet.id,
      occurredAt: new Date('2026-10-05T05:00:00.000Z'),
      note: 'Gaji',
    });
    await createGoal(db, userId, {
      name: 'Dana darurat',
      targetAmount: 5_000_000,
      walletId: wallet.id,
    });

    const backup = await exportBackup(db, userId);
    expect(backup.version).toBe(1);
    expect(backup.data.wallets).toHaveLength(1);
    expect(backup.data.transactions).toHaveLength(1);
    expect(backup.data.goals).toHaveLength(1);

    // Tambah data yang harus hilang setelah restore.
    await createTransaction(db, userId, {
      kind: 'expense',
      amount: 250_000,
      walletId: wallet.id,
      occurredAt: new Date('2026-10-06T05:00:00.000Z'),
    });
    expect((await listWallets(db, userId))[0].balance).toBe(750_000);

    const result = await restoreBackup(db, userId, JSON.stringify(backup));
    expect(result.transactions).toBe(1);
    expect(result.wallets).toBe(1);
    expect(result.goals).toBe(1);

    const walletsAfter = await listWallets(db, userId);
    expect(walletsAfter).toHaveLength(1);
    expect(walletsAfter[0].balance).toBe(1_000_000);
    expect(await listGoals(db, userId)).toHaveLength(1);
    expect((await listTransactions(db, userId)).items).toHaveLength(1);
  });

  it('menolak JSON yang bukan backup aplikasi', async () => {
    const userId = randomUUID();
    await expect(restoreBackup(db, userId, '{"version":2,"data":{}}')).rejects.toThrow();
    await expect(restoreBackup(db, userId, 'bukan json')).rejects.toThrow();
  });
});

describe('import CSV', () => {
  it('membuat kantong/kategori baru dan mencatat transaksi', async () => {
    const userId = randomUUID();
    const result = await importTransactions(db, userId, [
      {
        date: '2026-10-05',
        time: '12:30',
        kind: 'expense',
        walletName: 'Dompet Impor',
        categoryName: 'Makan Impor',
        amount: 25_000,
        note: 'Makan siang',
        tags: ['impor'],
        groupId: null,
      },
      {
        date: '2026-10-06',
        time: null,
        kind: 'income',
        walletName: 'Dompet Impor',
        categoryName: 'Gaji Impor',
        amount: 100_000,
        note: null,
        tags: [],
        groupId: null,
      },
    ]);

    expect(result).toEqual({ imported: 2, walletsCreated: 1, categoriesCreated: 2 });
    const wallets = await listWallets(db, userId);
    expect(wallets).toHaveLength(1);
    expect(wallets[0]).toMatchObject({ name: 'Dompet Impor', balance: 75_000 });

    const { items } = await listTransactions(db, userId);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ kind: 'income', amount: 100_000 });
    expect(items[1]).toMatchObject({ kind: 'expense', amount: 25_000, note: 'Makan siang' });
  });

  it('impor kedua memakai kantong/kategori yang sudah ada', async () => {
    const userId = randomUUID();
    await importTransactions(db, userId, [
      {
        date: '2026-10-05',
        time: null,
        kind: 'expense',
        walletName: 'Dompet Impor',
        categoryName: 'Makan Impor',
        amount: 10_000,
        note: null,
        tags: [],
        groupId: null,
      },
    ]);
    const second = await importTransactions(db, userId, [
      {
        date: '2026-10-07',
        time: null,
        kind: 'expense',
        walletName: 'dompet impor',
        categoryName: 'makan impor',
        amount: 15_000,
        note: null,
        tags: [],
        groupId: null,
      },
    ]);
    expect(second).toEqual({ imported: 1, walletsCreated: 0, categoriesCreated: 0 });
    expect((await listWallets(db, userId))[0].balance).toBe(-25_000);
  });
});
