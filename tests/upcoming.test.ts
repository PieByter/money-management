import { randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AppDb } from '@/server/db/client';
import { jakartaYmd } from '@/lib/dates';
import { createWallet } from '@/server/services/wallets';
import { createTemplate, runDueTemplatesForAll } from '@/server/services/templates';
import { listTransactions } from '@/server/services/transactions';
import { getUpcoming } from '@/server/services/upcoming';

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

describe('kartu akan datang & cron template', () => {
  it('menampilkan template dan tagihan kartu kredit yang akan jatuh tempo', async () => {
    const userId = randomUUID();
    const wallet = await createWallet(db, userId, { name: 'Cash', type: 'cash' });
    await createTemplate(db, userId, {
      name: 'Kopi harian',
      kind: 'expense',
      amount: 18_000,
      walletId: wallet.id,
      frequency: 'daily',
    });

    const today = jakartaYmd(new Date());
    const todayDay = Number(today.slice(8, 10));
    const dueDay = todayDay >= 28 ? 1 : todayDay + 1;
    await createWallet(db, userId, {
      name: 'Kartu Jatuh Tempo',
      type: 'credit',
      creditLimit: 5_000_000,
      dueDay,
      openingBalance: 750_000,
    });

    const items = await getUpcoming(db, userId);
    expect(items.some((item) => item.kind === 'template')).toBe(true);
    const credit = items.find((item) => item.kind === 'credit');
    expect(credit).toMatchObject({ amount: 750_000, title: 'Bayar Kartu Jatuh Tempo' });
    expect(items).toEqual(
      [...items].sort((a, b) => a.date.getTime() - b.date.getTime()),
    );
  });

  it('cron memposting template jatuh tempo untuk semua user sekali saja', async () => {
    const userId = randomUUID();
    const wallet = await createWallet(db, userId, { name: 'Cash Cron', type: 'cash' });
    await createTemplate(db, userId, {
      name: 'Langganan',
      kind: 'expense',
      amount: 50_000,
      walletId: wallet.id,
      frequency: 'daily',
    });

    const future = new Date(Date.now() + 3 * 86_400_000);
    const first = await runDueTemplatesForAll(db, future);
    expect(first.users).toBeGreaterThanOrEqual(1);
    expect(first.created).toBeGreaterThan(0);

    const afterFirst = (await listTransactions(db, userId)).items.length;
    expect(afterFirst).toBeGreaterThan(0);

    const second = await runDueTemplatesForAll(db, future);
    expect(second.created).toBe(0);
    expect((await listTransactions(db, userId)).items.length).toBe(afterFirst);
  });
});
