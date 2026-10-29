import { and, asc, eq, lte, ne } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import {
  categories,
  transactionTemplates,
  wallets,
  type TransactionTemplate,
} from '../db/schema';
import { jakartaDateAtNoonUtc, jakartaStartOfDayUtc, jakartaYmd, shiftYmd } from '@/lib/dates';
import {
  nextRunYmd,
  type TemplateFrequency,
  type TemplateSchedule,
} from '@/lib/template-schedule';
import type { TemplateItemLine, TemplateSummary } from '@/lib/view-types';
import { ServiceError } from './errors';
import {
  assertCategory,
  assertWallet,
  createTransaction,
  type SimpleKind,
} from './transactions';
import type { ItemLineInput } from './items';

const MAX_ITEMS = 60;
const MAX_TAGS = 10;
/** Kemunculan lebih tua dari ini dilewati agar ledger tidak dibanjiri data lama. */
const BACKFILL_DAYS = 31;
const MAX_RUNS_PER_TEMPLATE = 10;

export interface TemplateInput {
  name: string;
  kind: SimpleKind;
  amount: number;
  walletId: string;
  categoryId?: string | null;
  note?: string | null;
  tags?: string[];
  items?: ItemLineInput[];
  frequency?: TemplateFrequency;
  weekday?: number | null;
  dayOfMonth?: number | null;
}

interface PreparedTemplate {
  name: string;
  kind: SimpleKind;
  amount: number;
  walletId: string;
  categoryId: string | null;
  note: string | null;
  tags: string[];
  items: TemplateItemLine[];
  frequency: TemplateFrequency;
  weekday: number | null;
  dayOfMonth: number | null;
}

export interface RunDueResult {
  created: number;
  skipped: number;
}

function normalizeTags(tags?: string[]): string[] {
  if (!tags?.length) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim().slice(0, 24);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
    if (result.length >= MAX_TAGS) break;
  }
  return result;
}

function normalizeItems(input: TemplateInput): TemplateItemLine[] {
  if (input.kind !== 'expense') return [];
  const lines = input.items ?? [];
  if (lines.length > MAX_ITEMS) {
    throw new ServiceError(`Maksimal ${MAX_ITEMS} item per template`);
  }
  const normalized = lines.map((line) => {
    const name = line.name?.trim() ?? '';
    if (!name) throw new ServiceError('Nama item wajib diisi');
    if (name.length > 60) throw new ServiceError('Nama item terlalu panjang');
    if (!Number.isSafeInteger(line.amount) || line.amount <= 0) {
      throw new ServiceError('Harga item harus lebih dari 0');
    }
    const qtyMilli = line.qtyMilli ?? 1000;
    if (!Number.isSafeInteger(qtyMilli) || qtyMilli <= 0) {
      throw new ServiceError('Jumlah item tidak valid');
    }
    return { itemId: line.itemId ?? null, name, amount: line.amount, qtyMilli };
  });
  const total = normalized.reduce((sum, line) => sum + line.amount, 0);
  if (total > input.amount) {
    throw new ServiceError('Total rincian item melebihi nominal template');
  }
  return normalized;
}

function normalizeSchedule(input: TemplateInput): TemplateSchedule {
  const frequency = input.frequency ?? 'none';
  if (frequency === 'weekly') {
    const weekday = input.weekday;
    if (!weekday || !Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
      throw new ServiceError('Pilih hari untuk jadwal mingguan');
    }
    return { frequency, weekday, dayOfMonth: null };
  }
  if (frequency === 'monthly') {
    const dayOfMonth = input.dayOfMonth;
    if (!dayOfMonth || !Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
      throw new ServiceError('Tanggal jadwal bulanan tidak valid');
    }
    return { frequency, weekday: null, dayOfMonth };
  }
  return { frequency, weekday: null, dayOfMonth: null };
}

async function prepareTemplate(
  db: AppDb,
  userId: string,
  input: TemplateInput,
): Promise<PreparedTemplate> {
  const name = input.name?.trim() ?? '';
  if (!name) throw new ServiceError('Nama template wajib diisi');
  if (name.length > 60) throw new ServiceError('Nama template terlalu panjang');
  if (input.kind !== 'income' && input.kind !== 'expense') {
    throw new ServiceError('Jenis template tidak valid');
  }
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
    throw new ServiceError('Nominal tidak valid');
  }
  await assertWallet(db, userId, input.walletId);
  if (input.categoryId) await assertCategory(db, userId, input.categoryId, input.kind);

  const note = input.note?.trim() ? input.note.trim() : null;
  if (note && note.length > 280) throw new ServiceError('Catatan terlalu panjang');

  return {
    name,
    kind: input.kind,
    amount: input.amount,
    walletId: input.walletId,
    categoryId: input.categoryId ?? null,
    note,
    tags: normalizeTags(input.tags),
    items: normalizeItems(input),
    ...normalizeSchedule(input),
  };
}

/** Kemunculan pertama setelah `from` (pukul 00:00 WIB), null bila tanpa jadwal. */
function nextRunFrom(schedule: TemplateSchedule, from: Date): Date | null {
  const nextYmd = nextRunYmd(schedule, jakartaYmd(from));
  return nextYmd ? jakartaStartOfDayUtc(nextYmd) : null;
}

function toSummary(
  template: TransactionTemplate,
  joined: {
    walletName: string | null;
    walletIcon: string | null;
    categoryName: string | null;
    categoryIcon: string | null;
  },
): TemplateSummary {
  return {
    id: template.id,
    name: template.name,
    kind: template.kind === 'income' ? 'income' : 'expense',
    amount: Number(template.amount),
    walletId: template.walletId,
    categoryId: template.categoryId,
    note: template.note,
    tags: template.tags ?? [],
    items: (template.items ?? []).map((line) => ({
      itemId: line.itemId ?? null,
      name: line.name,
      amount: Number(line.amount),
      qtyMilli: Number(line.qtyMilli ?? 1000),
    })),
    frequency: template.frequency,
    weekday: template.weekday,
    dayOfMonth: template.dayOfMonth,
    nextRunAt: template.nextRunAt ? template.nextRunAt.toISOString() : null,
    nextRunYmd: template.nextRunAt ? jakartaYmd(template.nextRunAt) : null,
    lastRunAt: template.lastRunAt ? template.lastRunAt.toISOString() : null,
    walletName: joined.walletName,
    walletIcon: joined.walletIcon,
    categoryName: joined.categoryName,
    categoryIcon: joined.categoryIcon,
  };
}

export async function listTemplates(db: AppDb, userId: string): Promise<TemplateSummary[]> {
  const rows = await db
    .select({
      template: transactionTemplates,
      walletName: wallets.name,
      walletIcon: wallets.icon,
      categoryName: categories.name,
      categoryIcon: categories.icon,
    })
    .from(transactionTemplates)
    .leftJoin(wallets, eq(wallets.id, transactionTemplates.walletId))
    .leftJoin(categories, eq(categories.id, transactionTemplates.categoryId))
    .where(eq(transactionTemplates.userId, userId))
    .orderBy(asc(transactionTemplates.name));

  return rows.map((row) => toSummary(row.template, row));
}

async function getTemplateOrThrow(
  db: AppDb,
  userId: string,
  templateId: string,
): Promise<TransactionTemplate> {
  const [row] = await db
    .select()
    .from(transactionTemplates)
    .where(and(eq(transactionTemplates.userId, userId), eq(transactionTemplates.id, templateId)))
    .limit(1);
  if (!row) throw new ServiceError('Template tidak ditemukan');
  return row;
}

export async function createTemplate(
  db: AppDb,
  userId: string,
  input: TemplateInput,
  now: Date = new Date(),
): Promise<TransactionTemplate> {
  const prepared = await prepareTemplate(db, userId, input);
  const [row] = await db
    .insert(transactionTemplates)
    .values({
      userId,
      ...prepared,
      nextRunAt: nextRunFrom(prepared, now),
    })
    .returning();
  return row;
}

/**
 * Ubah template. Jadwal dihitung ulang dari hari ini supaya perubahan jam/hari
 * tidak menumpuk kemunculan lama.
 */
export async function updateTemplate(
  db: AppDb,
  userId: string,
  templateId: string,
  input: TemplateInput,
  now: Date = new Date(),
): Promise<TransactionTemplate> {
  const prepared = await prepareTemplate(db, userId, input);
  const [row] = await db
    .update(transactionTemplates)
    .set({
      ...prepared,
      nextRunAt: nextRunFrom(prepared, now),
      updatedAt: now,
    })
    .where(and(eq(transactionTemplates.userId, userId), eq(transactionTemplates.id, templateId)))
    .returning();
  if (!row) throw new ServiceError('Template tidak ditemukan');
  return row;
}

export async function deleteTemplate(
  db: AppDb,
  userId: string,
  templateId: string,
): Promise<void> {
  const removed = await db
    .delete(transactionTemplates)
    .where(and(eq(transactionTemplates.userId, userId), eq(transactionTemplates.id, templateId)))
    .returning({ id: transactionTemplates.id });
  if (removed.length === 0) throw new ServiceError('Template tidak ditemukan');
}

/** Catat transaksi dari template sekarang juga (tanpa mengubah jadwalnya). */
export async function applyTemplate(
  db: AppDb,
  userId: string,
  templateId: string,
  opts: { occurredAt?: Date } = {},
): Promise<{ transactionId: string }> {
  const template = await getTemplateOrThrow(db, userId, templateId);
  const items =
    template.kind === 'expense' && template.items && template.items.length > 0
      ? template.items
      : undefined;
  const transaction = await createTransaction(db, userId, {
    kind: template.kind,
    amount: Number(template.amount),
    walletId: template.walletId,
    categoryId: template.categoryId,
    occurredAt: opts.occurredAt ?? new Date(),
    note: template.note ?? template.name,
    tags: template.tags ?? [],
    items,
    source: 'template',
  });
  return { transactionId: transaction.id };
}

/**
 * Posting semua template terjadwal yang sudah jatuh tempo. Dipanggil saat
 * layout aplikasi dirender, jadi tidak butuh cron: begitu aplikasi dibuka,
 * transaksi yang terlewat langsung masuk.
 *
 * Kemunculan diklaim dengan update bersyarat (`next_run_at` lama) sehingga dua
 * request bersamaan tidak membuat transaksi ganda.
 */
export async function runDueTemplates(
  db: AppDb,
  userId: string,
  now: Date = new Date(),
): Promise<RunDueResult> {
  const due = await db
    .select({ id: transactionTemplates.id })
    .from(transactionTemplates)
    .where(
      and(
        eq(transactionTemplates.userId, userId),
        ne(transactionTemplates.frequency, 'none'),
        lte(transactionTemplates.nextRunAt, now),
      ),
    )
    .orderBy(asc(transactionTemplates.nextRunAt))
    .limit(50);

  let created = 0;
  let skipped = 0;
  const earliestYmd = shiftYmd(jakartaYmd(now), -BACKFILL_DAYS);

  for (const entry of due) {
    const template = await getTemplateOrThrow(db, userId, entry.id);
    let current = template.nextRunAt;
    for (let run = 0; run < MAX_RUNS_PER_TEMPLATE && current && current <= now; run += 1) {
      const runYmd = jakartaYmd(current);
      const nextYmd = nextRunYmd(template, runYmd);
      const nextAt = nextYmd ? jakartaStartOfDayUtc(nextYmd) : null;

      const claimed = await db
        .update(transactionTemplates)
        .set({ nextRunAt: nextAt, updatedAt: now })
        .where(
          and(
            eq(transactionTemplates.userId, userId),
            eq(transactionTemplates.id, template.id),
            eq(transactionTemplates.nextRunAt, current),
          ),
        )
        .returning({ id: transactionTemplates.id });
      if (claimed.length === 0) break;

      if (runYmd >= earliestYmd) {
        try {
          await applyTemplate(db, userId, template.id, {
            occurredAt: jakartaDateAtNoonUtc(runYmd),
          });
          created += 1;
          await db
            .update(transactionTemplates)
            .set({ lastRunAt: current })
            .where(eq(transactionTemplates.id, template.id));
        } catch {
          // Satu template rusak (mis. kantong diarsipkan) tidak boleh
          // menghentikan template lain; kemunculan ini dilewati saja.
          skipped += 1;
        }
      } else {
        skipped += 1;
      }
      current = nextAt;
    }
  }

  return { created, skipped };
}
