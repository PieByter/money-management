import { randomBytes } from 'node:crypto';
import { and, eq, gt, lt } from 'drizzle-orm';
import { formatIdr } from '@/lib/money';
import { captureError } from '@/lib/observability';
import { parseChatMessage } from '@/lib/telegram-parser';
import type { AppDb } from '../db/client';
import {
  channelLinkTokens,
  channelLinks,
  ingestEvents,
  type Channel,
} from '../db/schema';
import { ServiceError } from './errors';
import { listCategories } from './categories';
import { getLastUsedWalletId } from './reports';
import { createTransaction, createTransfer } from './transactions';
import { listWallets } from './wallets';

const LINK_TTL_MS = 15 * 60 * 1000;

export interface TelegramStatus {
  linked: boolean;
  chatId: string | null;
  verifiedAt: Date | null;
  configured: boolean;
  botUsername: string | null;
}

export function telegramBotUsername(): string | null {
  const value = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, '');
  return value || null;
}

export function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim());
}

export async function getTelegramStatus(
  db: AppDb,
  userId: string,
): Promise<TelegramStatus> {
  const [row] = await db
    .select()
    .from(channelLinks)
    .where(and(eq(channelLinks.userId, userId), eq(channelLinks.channel, 'telegram')))
    .limit(1);
  return {
    linked: Boolean(row),
    chatId: row?.externalChatId ?? null,
    verifiedAt: row?.verifiedAt ?? null,
    configured: telegramConfigured(),
    botUsername: telegramBotUsername(),
  };
}

export interface TelegramLinkToken {
  token: string;
  expiresAt: Date;
  command: string;
  deepLink: string | null;
}

export async function createTelegramLinkToken(
  db: AppDb,
  userId: string,
  now: Date = new Date(),
): Promise<TelegramLinkToken> {
  // Bersihkan token lama/kedaluwarsa milik user ini.
  await db
    .delete(channelLinkTokens)
    .where(
      and(
        eq(channelLinkTokens.userId, userId),
        eq(channelLinkTokens.channel, 'telegram'),
      ),
    );

  const token = randomBytes(12).toString('hex');
  const expiresAt = new Date(now.getTime() + LINK_TTL_MS);
  await db.insert(channelLinkTokens).values({
    token,
    userId,
    channel: 'telegram',
    expiresAt,
  });

  const username = telegramBotUsername();
  return {
    token,
    expiresAt,
    command: `/start ${token}`,
    deepLink: username ? `https://t.me/${username}?start=${token}` : null,
  };
}

async function linkChat(
  db: AppDb,
  token: string,
  chatId: string,
  now: Date = new Date(),
): Promise<{ userId: string }> {
  const [row] = await db
    .select()
    .from(channelLinkTokens)
    .where(
      and(
        eq(channelLinkTokens.token, token),
        eq(channelLinkTokens.channel, 'telegram'),
        gt(channelLinkTokens.expiresAt, now),
      ),
    )
    .limit(1);
  if (!row) {
    throw new ServiceError('Token tautan tidak valid atau sudah kedaluwarsa.');
  }

  const [usedByOther] = await db
    .select({ userId: channelLinks.userId })
    .from(channelLinks)
    .where(
      and(
        eq(channelLinks.channel, 'telegram'),
        eq(channelLinks.externalChatId, chatId),
      ),
    )
    .limit(1);
  if (usedByOther && usedByOther.userId !== row.userId) {
    throw new ServiceError('Chat ini sudah terhubung ke akun lain.');
  }

  await db
    .delete(channelLinks)
    .where(
      and(
        eq(channelLinks.userId, row.userId),
        eq(channelLinks.channel, 'telegram'),
      ),
    );
  await db.insert(channelLinks).values({
    userId: row.userId,
    channel: 'telegram',
    externalChatId: chatId,
  });
  await db.delete(channelLinkTokens).where(eq(channelLinkTokens.token, token));
  return { userId: row.userId };
}

export async function unlinkTelegram(db: AppDb, userId: string): Promise<void> {
  await db
    .delete(channelLinks)
    .where(and(eq(channelLinks.userId, userId), eq(channelLinks.channel, 'telegram')));
}

const HELP_TEXT = [
  'Cara mencatat lewat chat:',
  '• makan siang 25rb gopay',
  '• +5jt gaji bca',
  '• tf bca>cash 500rb',
  '',
  'Nominal mendukung rb/ribu/k dan jt/juta.',
  'Perintah: /saldo, /help, /start <token>',
].join('\n');

function startInstructions(): string {
  const username = telegramBotUsername();
  return [
    'Chat ini belum terhubung ke akun Money Tracker.',
    'Buka aplikasi → Pengaturan → Telegram, buat token tautan, lalu kirim:',
    '/start <token>',
    username ? `Bot: @${username}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export async function sendTelegramMessage(chatId: string, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    console.warn('[telegram] TELEGRAM_BOT_TOKEN belum diatur; balasan tidak dikirim.');
    return;
  }
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      console.error('[telegram] gagal mengirim balasan', response.status, await response.text());
    }
  } catch (error) {
    console.error('[telegram] gagal mengirim balasan', error);
  }
}

interface TelegramMessage {
  message_id?: number;
  chat?: { id?: number | string };
  text?: string;
}

export interface TelegramUpdate {
  update_id?: number;
  message?: TelegramMessage;
}

async function reply(chatId: string, text: string): Promise<void> {
  await sendTelegramMessage(chatId, text);
}

async function handleCommand(
  db: AppDb,
  chatId: string,
  text: string,
): Promise<{ userId: string | null; status: 'processed' | 'ignored' | 'error'; parsed?: unknown }> {
  const [command, ...rest] = text.trim().split(/\s+/);
  const normalized = command.toLowerCase();

  if (normalized === '/start') {
    const token = rest[0];
    if (!token) {
      await reply(chatId, startInstructions());
      return { userId: null, status: 'ignored' };
    }
    try {
      const { userId } = await linkChat(db, token, chatId);
      await reply(
        chatId,
        '✅ Chat berhasil terhubung.\nCoba kirim: makan siang 25rb gopay\nKetik /help untuk contoh lain.',
      );
      return { userId, status: 'processed' };
    } catch (error) {
      const message = error instanceof ServiceError ? error.message : 'Gagal menautkan chat.';
      await reply(chatId, `❌ ${message}\nBuat token baru di Pengaturan → Telegram.`);
      return { userId: null, status: 'error', parsed: { error: message } };
    }
  }

  if (normalized === '/help' || normalized === '/bantuan') {
    await reply(chatId, HELP_TEXT);
    return { userId: null, status: 'ignored' };
  }

  const [link] = await db
    .select()
    .from(channelLinks)
    .where(
      and(
        eq(channelLinks.channel, 'telegram'),
        eq(channelLinks.externalChatId, chatId),
      ),
    )
    .limit(1);
  if (!link) {
    await reply(chatId, startInstructions());
    return { userId: null, status: 'ignored' };
  }

  if (normalized === '/saldo') {
    const wallets = await listWallets(db, link.userId);
    const lines = wallets.map(
      (wallet) => `${wallet.icon ?? '•'} ${wallet.name}: ${formatIdr(wallet.balance)}`,
    );
    await reply(chatId, lines.length > 0 ? lines.join('\n') : 'Belum ada kantong.');
    return { userId: link.userId, status: 'processed' };
  }

  if (text.startsWith('/')) {
    await reply(chatId, `Perintah tidak dikenal.\n\n${HELP_TEXT}`);
    return { userId: link.userId, status: 'ignored' };
  }

  const [wallets, categories, lastWalletId] = await Promise.all([
    listWallets(db, link.userId),
    listCategories(db, link.userId),
    getLastUsedWalletId(db, link.userId),
  ]);
  const parsed = parseChatMessage(text, {
    wallets: wallets.map((wallet) => ({ id: wallet.id, name: wallet.name })),
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      kind: category.kind,
    })),
    lastWalletId,
  });

  if (!parsed.ok) {
    await reply(
      chatId,
      `❌ ${parsed.reason}\n\nContoh:\n• makan siang 25rb gopay\n• +5jt gaji bca\n• tf bca>cash 500rb`,
    );
    return { userId: link.userId, status: 'ignored', parsed };
  }

  try {
    if (parsed.kind === 'transfer') {
      await createTransfer(db, link.userId, {
        fromWalletId: parsed.fromWalletId,
        toWalletId: parsed.toWalletId,
        amount: parsed.amount,
        occurredAt: new Date(),
        note: parsed.note,
        source: 'telegram',
      });
      const balances = await listWallets(db, link.userId);
      const from = balances.find((wallet) => wallet.id === parsed.fromWalletId);
      const to = balances.find((wallet) => wallet.id === parsed.toWalletId);
      await reply(
        chatId,
        [
          `✅ Transfer ${formatIdr(parsed.amount)}`,
          `${parsed.fromWalletName} → ${parsed.toWalletName}`,
          from ? `Saldo ${from.name}: ${formatIdr(from.balance)}` : '',
          to ? `Saldo ${to.name}: ${formatIdr(to.balance)}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      );
      return { userId: link.userId, status: 'processed', parsed };
    }

    await createTransaction(db, link.userId, {
      kind: parsed.kind,
      amount: parsed.amount,
      walletId: parsed.walletId,
      categoryId: parsed.categoryId,
      occurredAt: new Date(),
      note: parsed.note,
      source: 'telegram',
      rawInput: text,
    });
    const balances = await listWallets(db, link.userId);
    const wallet = balances.find((entry) => entry.id === parsed.walletId);
    await reply(
      chatId,
      [
        `✅ ${parsed.kind === 'income' ? 'Pemasukan' : 'Pengeluaran'} ${formatIdr(parsed.amount)}`,
        `Kantong: ${parsed.walletName}${parsed.usedLastWallet ? ' (terakhir dipakai)' : ''}`,
        parsed.categoryName ? `Kategori: ${parsed.categoryName}` : '',
        parsed.note ? `Catatan: ${parsed.note}` : '',
        wallet ? `Saldo ${wallet.name}: ${formatIdr(wallet.balance)}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    );
    return { userId: link.userId, status: 'processed', parsed };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gagal menyimpan transaksi.';
    await reply(chatId, `❌ ${message}`);
    return { userId: link.userId, status: 'error', parsed };
  }
}

export interface TelegramHandleResult {
  duplicate: boolean;
  status?: 'processed' | 'ignored' | 'error';
}

/**
 * Proses satu update Telegram. Idempotensi diklaim lewat `ingest_events`
 * sebelum efek samping apa pun, sehingga retry webhook tidak menduplikasi
 * transaksi.
 */
export async function handleTelegramUpdate(
  db: AppDb,
  update: TelegramUpdate,
): Promise<TelegramHandleResult> {
  const message = update.message;
  const chatId =
    message?.chat?.id !== undefined ? String(message.chat.id) : null;
  if (!message || !chatId) return { duplicate: false, status: 'ignored' };

  const externalMessageId = `${chatId}:${message.message_id ?? update.update_id ?? Date.now()}`;
  const text = message.text?.trim() ?? '';
  if (!text) return { duplicate: false, status: 'ignored' };

  const [event] = await db
    .insert(ingestEvents)
    .values({
      channel: 'telegram',
      externalMessageId,
      payload: update,
      status: 'received',
    })
    .onConflictDoNothing()
    .returning({ id: ingestEvents.id });
  if (!event) return { duplicate: true };

  try {
    const result = await handleCommand(db, chatId, text);
    await db
      .update(ingestEvents)
      .set({
        userId: result.userId,
        status: result.status,
        parsed: result.parsed ?? null,
        error: result.status === 'error' ? 'Lihat parsed.error' : null,
      })
      .where(eq(ingestEvents.id, event.id));
    return { duplicate: false, status: result.status };
  } catch (error) {
    captureError(error, { area: 'telegram.handle', chatId });
    await db
      .update(ingestEvents)
      .set({
        status: 'error',
        error: error instanceof Error ? error.message : 'unknown',
      })
      .where(eq(ingestEvents.id, event.id));
    return { duplicate: false, status: 'error' };
  }
}

/** Bersihkan token kedaluwarsa; dipanggil saat cron harian. */
export async function cleanupTelegramTokens(
  db: AppDb,
  now: Date = new Date(),
): Promise<number> {
  const removed = await db
    .delete(channelLinkTokens)
    .where(and(eq(channelLinkTokens.channel, 'telegram' as Channel), lt(channelLinkTokens.expiresAt, now)))
    .returning({ token: channelLinkTokens.token });
  return removed.length;
}
