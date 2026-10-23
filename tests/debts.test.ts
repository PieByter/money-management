import { randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AppDb } from '@/server/db/client';
import { ensureDefaults } from '@/server/services/defaults';
import { createWallet, deleteWallet, listWallets } from '@/server/services/wallets';
import { listCategories } from '@/server/services/categories';
import {
  addDebtPayment,
  createDebt,
  deleteDebt,
  deleteDebtPayment,
  getDebt,
  getDebtSummary,
  listDebts,
  settleDebt,
  updateDebt,
} from '@/server/services/debts';
import { ServiceError } from '@/server/services/errors';
import { ledgerInvariant, listTransactions } from '@/server/services/transactions';
import { getMonthSummary } from '@/server/services/reports';

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

/** Kantong uji dengan saldo awal supaya alur uang bisa dibandingkan angkanya. */
async function newWallet(
  userId: string,
  base: string,
  openingBalance = 0,
): Promise<{ id: string; name: string }> {
  walletCounter += 1;
  const wallet = await createWallet(db, userId, {
    name: `${base} uji ${walletCounter}`,
    type: 'bank',
    openingBalance,
  });
  return { id: wallet.id, name: wallet.name };
}

async function balanceOf(userId: string, walletId: string): Promise<number> {
  const wallets = await listWallets(db, userId);
  return wallets.find((wallet) => wallet.id === walletId)?.balance ?? 0;
}

const at = (iso: string): Date => new Date(iso);

describe('hutang (payable)', () => {
  it('mencatat dana masuk ke kantong sumber dan pelunasan dari kantong pembayaran', async () => {
    const userId = await newUser();
    const jago = await newWallet(userId, 'Bank Jago');
    const dana = await newWallet(userId, 'Dana', 2_000_000);

    const debt = await createDebt(db, userId, {
      direction: 'payable',
      counterparty: 'Bank Jago',
      purpose: 'Beli motor',
      principal: 1_000_000,
      fundingWalletId: jago.id,
      paymentWalletId: dana.id,
      startedAt: at('2026-01-05T05:00:00Z'),
    });

    // Pinjaman cair di Bank Jago, bukan di Dana.
    expect(await balanceOf(userId, jago.id)).toBe(1_000_000);
    expect(await balanceOf(userId, dana.id)).toBe(2_000_000);

    const before = await getDebt(db, userId, debt.id);
    expect(before?.direction).toBe('payable');
    expect(before?.purpose).toBe('Beli motor');
    expect(before?.principal).toBe(1_000_000);
    expect(before?.paid).toBe(0);
    expect(before?.remaining).toBe(1_000_000);
    expect(before?.status).toBe('open');
    expect(before?.fundingWallet.id).toBe(jago.id);
    expect(before?.paymentWallet.id).toBe(dana.id);
    expect(before?.flow).toHaveLength(1);
    expect(before?.flow[0].type).toBe('funding');

    await addDebtPayment(db, userId, debt.id, {
      amount: 400_000,
      walletId: dana.id,
      occurredAt: at('2026-02-05T05:00:00Z'),
    });
    expect(await balanceOf(userId, dana.id)).toBe(1_600_000);

    const middle = await getDebt(db, userId, debt.id);
    expect(middle?.paid).toBe(400_000);
    expect(middle?.remaining).toBe(600_000);
    expect(middle?.status).toBe('open');
    expect(middle?.flow.map((event) => event.type)).toEqual(['funding', 'payment']);

    // Tombol "Lunas": sisa 600.000 langsung diposting keluar dari Dana.
    await settleDebt(db, userId, debt.id, {
      walletId: dana.id,
      occurredAt: at('2026-03-05T05:00:00Z'),
    });
    expect(await balanceOf(userId, dana.id)).toBe(1_000_000);

    const after = await getDebt(db, userId, debt.id);
    expect(after?.status).toBe('paid');
    expect(after?.remaining).toBe(0);
    expect(after?.paid).toBe(1_000_000);
    expect(after?.payments).toHaveLength(2);

    const ledger = await listTransactions(db, userId, { filter: { tag: 'hutang' } });
    expect(ledger.items).toHaveLength(3);

    const categories = await listCategories(db, userId, { includeArchived: true });
    expect(categories.some((category) => category.name === 'Pinjaman Masuk')).toBe(true);
    expect(categories.some((category) => category.name === 'Bayar Hutang')).toBe(true);

    const invariant = await ledgerInvariant(db, userId);
    expect(invariant.totalBalances).toBe(invariant.expected);
  });

  it('menolak pembayaran melebihi sisa dan pelunasan ganda', async () => {
    const userId = await newUser();
    const jago = await newWallet(userId, 'Jago');
    const dana = await newWallet(userId, 'Dana', 1_000_000);

    const debt = await createDebt(db, userId, {
      direction: 'payable',
      counterparty: 'Bank Jago',
      principal: 300_000,
      fundingWalletId: jago.id,
      paymentWalletId: dana.id,
      startedAt: at('2026-01-05T05:00:00Z'),
    });

    await expect(
      addDebtPayment(db, userId, debt.id, {
        amount: 400_000,
        walletId: dana.id,
        occurredAt: at('2026-01-06T05:00:00Z'),
      }),
    ).rejects.toBeInstanceOf(ServiceError);

    await settleDebt(db, userId, debt.id, {
      walletId: dana.id,
      occurredAt: at('2026-01-07T05:00:00Z'),
    });
    await expect(
      settleDebt(db, userId, debt.id, {
        walletId: dana.id,
        occurredAt: at('2026-01-08T05:00:00Z'),
      }),
    ).rejects.toBeInstanceOf(ServiceError);
    expect(await balanceOf(userId, dana.id)).toBe(700_000);
  });

  it('membatalkan satu pembayaran tanpa menghapus pinjamannya', async () => {
    const userId = await newUser();
    const jago = await newWallet(userId, 'Jago');
    const dana = await newWallet(userId, 'Dana', 1_000_000);

    const debt = await createDebt(db, userId, {
      direction: 'payable',
      counterparty: 'Bank Jago',
      principal: 500_000,
      fundingWalletId: jago.id,
      paymentWalletId: dana.id,
      startedAt: at('2026-01-05T05:00:00Z'),
    });
    const payment = await addDebtPayment(db, userId, debt.id, {
      amount: 200_000,
      walletId: dana.id,
      occurredAt: at('2026-01-06T05:00:00Z'),
    });
    expect(await balanceOf(userId, dana.id)).toBe(800_000);

    await deleteDebtPayment(db, userId, payment.id);
    expect(await balanceOf(userId, dana.id)).toBe(1_000_000);

    const detail = await getDebt(db, userId, debt.id);
    expect(detail?.paid).toBe(0);
    expect(detail?.remaining).toBe(500_000);
    expect(detail?.payments).toHaveLength(0);
  });

  it('menghapus pinjaman mengembalikan seluruh uang ke kondisi awal', async () => {
    const userId = await newUser();
    const jago = await newWallet(userId, 'Jago');
    const dana = await newWallet(userId, 'Dana', 1_000_000);

    const debt = await createDebt(db, userId, {
      direction: 'payable',
      counterparty: 'Bank Jago',
      principal: 750_000,
      fundingWalletId: jago.id,
      paymentWalletId: dana.id,
      startedAt: at('2026-01-05T05:00:00Z'),
    });
    await settleDebt(db, userId, debt.id, {
      walletId: dana.id,
      occurredAt: at('2026-02-05T05:00:00Z'),
    });

    await deleteDebt(db, userId, debt.id);
    expect(await balanceOf(userId, jago.id)).toBe(0);
    expect(await balanceOf(userId, dana.id)).toBe(1_000_000);
    expect(await getDebt(db, userId, debt.id)).toBeNull();

    const invariant = await ledgerInvariant(db, userId);
    expect(invariant.totalBalances).toBe(invariant.expected);
  });

  it('memperbarui tujuan, lawan transaksi, dan jatuh tempo', async () => {
    const userId = await newUser();
    const jago = await newWallet(userId, 'Jago');
    const dana = await newWallet(userId, 'Dana');

    const debt = await createDebt(db, userId, {
      direction: 'payable',
      counterparty: 'Jago',
      principal: 100_000,
      fundingWalletId: jago.id,
      paymentWalletId: dana.id,
      startedAt: at('2026-01-05T05:00:00Z'),
    });

    await updateDebt(db, userId, debt.id, {
      counterparty: 'Bank Jago',
      purpose: 'Modal usaha',
      dueAt: at('2026-06-01T05:00:00Z'),
    });

    const detail = await getDebt(db, userId, debt.id);
    expect(detail?.counterparty).toBe('Bank Jago');
    expect(detail?.purpose).toBe('Modal usaha');
    expect(detail?.dueAt?.toISOString()).toBe(at('2026-06-01T05:00:00Z').toISOString());
  });
});

describe('piutang (receivable)', () => {
  it('uang keluar saat dipinjamkan dan bertambah lagi saat lunas', async () => {
    const userId = await newUser();
    const cash = await newWallet(userId, 'Cash', 1_000_000);
    const gopay = await newWallet(userId, 'GoPay');

    const debt = await createDebt(db, userId, {
      direction: 'receivable',
      counterparty: 'Budi',
      purpose: 'Pinjam darurat',
      principal: 400_000,
      fundingWalletId: cash.id,
      paymentWalletId: gopay.id,
      startedAt: at('2026-01-10T05:00:00Z'),
    });
    expect(await balanceOf(userId, cash.id)).toBe(600_000);
    expect(await balanceOf(userId, gopay.id)).toBe(0);

    await settleDebt(db, userId, debt.id, {
      walletId: gopay.id,
      occurredAt: at('2026-02-10T05:00:00Z'),
    });
    // Uang kembali masuk ke GoPay (kantong penerimaan), bukan ke Cash.
    expect(await balanceOf(userId, gopay.id)).toBe(400_000);
    expect(await balanceOf(userId, cash.id)).toBe(600_000);

    const detail = await getDebt(db, userId, debt.id);
    expect(detail?.status).toBe('paid');
    expect(detail?.flow.map((event) => event.type)).toEqual(['funding', 'payment']);
  });

  it('melaporkan arus pinjaman sebagai pemasukan/pengeluaran bulan berjalan', async () => {
    const userId = await newUser();
    const cash = await newWallet(userId, 'Cash', 1_000_000);
    const dana = await newWallet(userId, 'Dana', 1_000_000);

    const payable = await createDebt(db, userId, {
      direction: 'payable',
      counterparty: 'Kredivo',
      principal: 200_000,
      fundingWalletId: cash.id,
      paymentWalletId: dana.id,
      startedAt: at('2026-04-03T05:00:00Z'),
    });
    await settleDebt(db, userId, payable.id, {
      walletId: dana.id,
      occurredAt: at('2026-04-20T05:00:00Z'),
    });

    const summary = await getMonthSummary(db, userId, '2026-04');
    expect(summary.income).toBe(200_000);
    expect(summary.expense).toBe(200_000);
    expect(summary.net).toBe(0);
  });
});

describe('ringkasan & daftar', () => {
  it('menghitung sisa hutang/piutang dan mengurutkan yang belum lunas lebih dulu', async () => {
    const userId = await newUser();
    const walletA = await newWallet(userId, 'Kantong A', 5_000_000);
    const walletB = await newWallet(userId, 'Kantong B');

    const payable = await createDebt(db, userId, {
      direction: 'payable',
      counterparty: 'Bank Jago',
      principal: 600_000,
      fundingWalletId: walletA.id,
      paymentWalletId: walletB.id,
      startedAt: at('2026-01-05T05:00:00Z'),
    });
    await addDebtPayment(db, userId, payable.id, {
      amount: 100_000,
      walletId: walletB.id,
      occurredAt: at('2026-01-20T05:00:00Z'),
    });

    const receivable = await createDebt(db, userId, {
      direction: 'receivable',
      counterparty: 'Sinta',
      principal: 250_000,
      fundingWalletId: walletA.id,
      paymentWalletId: walletB.id,
      startedAt: at('2026-01-06T05:00:00Z'),
    });
    await settleDebt(db, userId, receivable.id, {
      walletId: walletB.id,
      occurredAt: at('2026-01-21T05:00:00Z'),
    });

    const list = await listDebts(db, userId);
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe(payable.id);
    expect(list[0].status).toBe('open');

    const summary = await getDebtSummary(db, userId);
    expect(summary.payableOutstanding).toBe(500_000);
    expect(summary.payablePrincipal).toBe(600_000);
    expect(summary.receivableOutstanding).toBe(0);
    expect(summary.receivablePrincipal).toBe(250_000);
    expect(summary.openCount).toBe(1);
    expect(summary.paidCount).toBe(1);
  });

  it('menolak menghapus kantong yang masih dipakai catatan pinjaman', async () => {
    const userId = await newUser();
    const jago = await newWallet(userId, 'Jago');
    const dana = await newWallet(userId, 'Dana');

    await createDebt(db, userId, {
      direction: 'payable',
      counterparty: 'Bank Jago',
      principal: 120_000,
      fundingWalletId: jago.id,
      paymentWalletId: dana.id,
      startedAt: at('2026-01-05T05:00:00Z'),
    });

    expect(await deleteWallet(db, userId, jago.id)).toEqual({
      deleted: false,
      reason: 'has_transactions',
    });
    expect(await deleteWallet(db, userId, dana.id)).toEqual({
      deleted: false,
      reason: 'has_transactions',
    });
  });

  it('menolak nominal pokok yang tidak valid', async () => {
    const userId = await newUser();
    const wallet = await newWallet(userId, 'Kantong');

    await expect(
      createDebt(db, userId, {
        direction: 'payable',
        counterparty: 'Bank Jago',
        principal: 0,
        fundingWalletId: wallet.id,
        paymentWalletId: wallet.id,
        startedAt: at('2026-01-05T05:00:00Z'),
      }),
    ).rejects.toBeInstanceOf(ServiceError);

    await expect(
      createDebt(db, userId, {
        direction: 'payable',
        counterparty: '   ',
        principal: 10_000,
        fundingWalletId: wallet.id,
        paymentWalletId: wallet.id,
        startedAt: at('2026-01-05T05:00:00Z'),
      }),
    ).rejects.toBeInstanceOf(ServiceError);
  });
});
