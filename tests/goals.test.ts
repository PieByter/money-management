import { randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AppDb } from '@/server/db/client';
import { createTransaction } from '@/server/services/transactions';
import { createWallet } from '@/server/services/wallets';
import {
  createGoal,
  deleteGoal,
  listGoals,
  setGoalArchived,
  updateGoal,
} from '@/server/services/goals';
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

describe('tujuan tabungan', () => {
  it('progres mengikuti saldo kantong, bukan kolom manual', async () => {
    const userId = randomUUID();
    const wallet = await createWallet(db, userId, { name: 'Tabungan Darurat', type: 'bank' });

    const goal = await createGoal(db, userId, {
      name: 'Dana darurat',
      targetAmount: 10_000_000,
      walletId: wallet.id,
      targetDate: '2027-12-31',
    });
    expect(goal).toMatchObject({
      name: 'Dana darurat',
      targetAmount: 10_000_000,
      saved: 0,
      remaining: 10_000_000,
      ratio: 0,
      wallet: { id: wallet.id, name: 'Tabungan Darurat' },
    });
    expect(goal.daysLeft).toBeGreaterThan(0);
    expect(goal.monthlyNeeded).toBeGreaterThan(0);

    await createTransaction(db, userId, {
      kind: 'income',
      amount: 2_500_000,
      walletId: wallet.id,
      occurredAt: new Date(),
      note: 'Setoran awal',
    });

    const [after] = await listGoals(db, userId);
    expect(after).toMatchObject({
      saved: 2_500_000,
      remaining: 7_500_000,
      ratio: 0.25,
    });
  });

  it('menolak dua goal aktif pada satu kantong dan nama duplikat', async () => {
    const userId = randomUUID();
    const wallet = await createWallet(db, userId, { name: 'Kantong Goal', type: 'bank' });
    const other = await createWallet(db, userId, { name: 'Kantong Lain', type: 'bank' });

    await createGoal(db, userId, {
      name: 'Liburan',
      targetAmount: 5_000_000,
      walletId: wallet.id,
    });

    await expect(
      createGoal(db, userId, {
        name: 'Liburan 2',
        targetAmount: 1_000_000,
        walletId: wallet.id,
      }),
    ).rejects.toThrow(ServiceError);

    await expect(
      createGoal(db, userId, {
        name: 'Liburan',
        targetAmount: 1_000_000,
        walletId: other.id,
      }),
    ).rejects.toThrow(ServiceError);
  });

  it('arsip membebaskan kantong, dan update mengubah target', async () => {
    const userId = randomUUID();
    const wallet = await createWallet(db, userId, { name: 'Kantong Goal', type: 'bank' });

    const goal = await createGoal(db, userId, {
      name: 'Motor',
      targetAmount: 20_000_000,
      walletId: wallet.id,
    });

    const updated = await updateGoal(db, userId, goal.id, {
      name: 'Motor Baru',
      targetAmount: 25_000_000,
      note: 'DP',
    });
    expect(updated).toMatchObject({
      name: 'Motor Baru',
      targetAmount: 25_000_000,
      note: 'DP',
    });

    await setGoalArchived(db, userId, goal.id, true);
    expect(await listGoals(db, userId)).toHaveLength(0);
    expect(await listGoals(db, userId, { includeArchived: true })).toHaveLength(1);

    const replacement = await createGoal(db, userId, {
      name: 'Motor Lain',
      targetAmount: 1_000_000,
      walletId: wallet.id,
    });
    expect(replacement.id).not.toBe(goal.id);

    await deleteGoal(db, userId, replacement.id);
    expect(await listGoals(db, userId, { includeArchived: true })).toHaveLength(1);
  });
});
