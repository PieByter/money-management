import { randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AppDb } from '@/server/db/client';
import { parseChatMessage, type ParseContext } from '@/lib/telegram-parser';
import { createTransaction, listTransactions } from '@/server/services/transactions';
import { createWallet } from '@/server/services/wallets';
import {
  createTelegramLinkToken,
  getTelegramStatus,
  handleTelegramUpdate,
} from '@/server/services/telegram';

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

function context(): ParseContext {
  return {
    wallets: [
      { id: 'w-bca', name: 'Bank BCA' },
      { id: 'w-cash', name: 'Cash' },
      { id: 'w-gopay', name: 'GoPay' },
      { id: 'w-dana', name: 'Dana' },
      { id: 'w-jago', name: 'Bank Jago' },
    ],
    categories: [
      { id: 'c-makan', name: 'Makan', kind: 'expense' },
      { id: 'c-transport', name: 'Transport', kind: 'expense' },
      { id: 'c-gaji', name: 'Gaji', kind: 'income' },
    ],
    lastWalletId: 'w-cash',
  };
}

describe('parser chat', () => {
  it('membaca pengeluaran dengan nominal rb dan kantong', () => {
    const parsed = parseChatMessage('makan siang 25rb gopay', context());
    expect(parsed).toMatchObject({
      ok: true,
      kind: 'expense',
      amount: 25_000,
      walletId: 'w-gopay',
      walletName: 'GoPay',
      categoryId: 'c-makan',
      note: 'makan siang',
      usedLastWallet: false,
    });
  });

  it('membaca pemasukan dengan awalan + dan nominal jt', () => {
    const parsed = parseChatMessage('+5jt gaji bca', context());
    expect(parsed).toMatchObject({
      ok: true,
      kind: 'income',
      amount: 5_000_000,
      walletId: 'w-bca',
      categoryId: 'c-gaji',
    });
  });

  it('membaca nominal desimal dan titik ribuan', () => {
    const decimal = parseChatMessage('liburan 1,5jt dana', context());
    expect(decimal).toMatchObject({ ok: true, amount: 1_500_000 });
    const thousands = parseChatMessage('belanja 25.000 cash', context());
    expect(thousands).toMatchObject({ ok: true, amount: 25_000 });
  });

  it('membaca transfer dua kantong', () => {
    const parsed = parseChatMessage('tf bca>cash 500rb', context());
    expect(parsed).toMatchObject({
      ok: true,
      kind: 'transfer',
      amount: 500_000,
      fromWalletName: 'Bank BCA',
      toWalletName: 'Cash',
    });
  });

  it('memakai kantong terakhir bila tidak disebut, dan gagal bila nominal tidak ada', () => {
    const parsed = parseChatMessage('kopi 18rb', context());
    expect(parsed).toMatchObject({
      ok: true,
      walletId: 'w-cash',
      usedLastWallet: true,
    });
    const failed = parseChatMessage('makan siang tanpa nominal', context());
    expect(failed.ok).toBe(false);
  });

  it('menolak nominal di luar batas aman', () => {
    const parsed = parseChatMessage('makan 999999999999999rb cash', context());
    expect(parsed.ok).toBe(false);
  });
});

describe('webhook telegram', () => {
  it('menautkan chat, mencatat transaksi, dan idempoten pada retry', async () => {
    const userId = randomUUID();
    const wallet = await createWallet(db, userId, { name: 'GoPay', type: 'ewallet' });
    await createTransaction(db, userId, {
      kind: 'income',
      amount: 100_000,
      walletId: wallet.id,
      occurredAt: new Date(),
    });

    const token = await createTelegramLinkToken(db, userId);
    const chatId = '123456';
    const start = await handleTelegramUpdate(db, {
      update_id: 1,
      message: { message_id: 1, chat: { id: chatId }, text: `/start ${token.token}` },
    });
    expect(start).toEqual({ duplicate: false, status: 'processed' });

    const status = await getTelegramStatus(db, userId);
    expect(status.linked).toBe(true);
    expect(status.chatId).toBe(chatId);

    const expense = await handleTelegramUpdate(db, {
      update_id: 2,
      message: { message_id: 2, chat: { id: chatId }, text: 'makan siang 25rb gopay' },
    });
    expect(expense).toEqual({ duplicate: false, status: 'processed' });

    const { items } = await listTransactions(db, userId);
    expect(items[0]).toMatchObject({
      kind: 'expense',
      amount: 25_000,
      walletName: 'GoPay',
      note: 'makan siang',
    });

    // Retry update yang sama tidak boleh membuat transaksi kedua.
    const retry = await handleTelegramUpdate(db, {
      update_id: 2,
      message: { message_id: 2, chat: { id: chatId }, text: 'makan siang 25rb gopay' },
    });
    expect(retry.duplicate).toBe(true);
    expect((await listTransactions(db, userId)).items).toHaveLength(2);
  });

  it('menolak pesan dari chat yang belum tertaut', async () => {
    const result = await handleTelegramUpdate(db, {
      update_id: 99,
      message: { message_id: 99, chat: { id: '999' }, text: 'makan 25rb gopay' },
    });
    expect(result).toEqual({ duplicate: false, status: 'ignored' });
  });
});
