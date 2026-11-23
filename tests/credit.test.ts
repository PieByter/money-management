import { randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AppDb } from '@/server/db/client';
import { createTransaction, createTransfer } from '@/server/services/transactions';
import { createWallet, listWallets } from '@/server/services/wallets';
import { createGoal } from '@/server/services/goals';
import { ServiceError } from '@/server/services/errors';

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

async function balanceOf(userId: string, walletId: string): Promise<number> {
  const wallets = await listWallets(db, userId);
  return wallets.find((wallet) => wallet.id === walletId)?.balance ?? 0;
}

describe('kartu kredit', () => {
  it('tagihan awal membuat saldo negatif dan pemakaian menambah tagihan', async () => {
    const userId = randomUUID();
    const card = await createWallet(db, userId, {
      name: 'Kartu Utama',
      type: 'credit',
      creditLimit: 5_000_000,
      statementDay: 25,
      dueDay: 5,
      openingBalance: 1_200_000,
    });

    expect(card.creditLimit).toBe(5_000_000);
    expect(card.statementDay).toBe(25);
    expect(card.dueDay).toBe(5);
    expect(await balanceOf(userId, card.id)).toBe(-1_200_000);

    await createTransaction(db, userId, {
      kind: 'expense',
      amount: 300_000,
      walletId: card.id,
      occurredAt: new Date(),
      note: 'Belanja',
    });
    expect(await balanceOf(userId, card.id)).toBe(-1_500_000);
  });

  it('pembayaran adalah transfer dan mengurangi tagihan tanpa menjadi pengeluaran', async () => {
    const userId = randomUUID();
    const bank = await createWallet(db, userId, { name: 'Bank Bayar', type: 'bank' });
    const card = await createWallet(db, userId, {
      name: 'Kartu Bayar',
      type: 'credit',
      creditLimit: 2_000_000,
      openingBalance: 500_000,
    });
    await createTransaction(db, userId, {
      kind: 'income',
      amount: 1_000_000,
      walletId: bank.id,
      occurredAt: new Date(),
    });

    await createTransfer(db, userId, {
      fromWalletId: bank.id,
      toWalletId: card.id,
      amount: 300_000,
      occurredAt: new Date(),
    });

    expect(await balanceOf(userId, bank.id)).toBe(700_000);
    expect(await balanceOf(userId, card.id)).toBe(-200_000);
  });

  it('menolak kartu kredit tanpa limit dan goal di kartu kredit', async () => {
    const userId = randomUUID();
    await expect(
      createWallet(db, userId, { name: 'Tanpa Limit', type: 'credit' }),
    ).rejects.toThrow();

    const card = await createWallet(db, userId, {
      name: 'Kartu Goal',
      type: 'credit',
      creditLimit: 1_000_000,
    });
    await expect(
      createGoal(db, userId, {
        name: 'Goal Kredit',
        targetAmount: 100_000,
        walletId: card.id,
      }),
    ).rejects.toThrow(ServiceError);
  });
});
