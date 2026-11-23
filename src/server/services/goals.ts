import { and, asc, eq, isNull, ne, sql } from 'drizzle-orm';
import { jakartaDateAtNoonUtc, jakartaYmd } from '@/lib/dates';
import type { AppDb } from '../db/client';
import { goals, wallets, walletBalances, type WalletType } from '../db/schema';
import { ServiceError } from './errors';

/**
 * Tujuan tabungan (goal). Progres selalu dihitung dari saldo kantong yang
 * ditautkan — sama seperti saldo kantong, tidak ada kolom "sudah terkumpul"
 * yang bisa melenceng dari ledger.
 */

export interface GoalWalletRef {
  id: string;
  name: string;
  icon: string | null;
  type: WalletType;
}

export interface GoalEntry {
  id: string;
  name: string;
  targetAmount: number;
  /** Saldo kantong (bisa negatif bila kantong sedang minus). */
  saved: number;
  remaining: number;
  /** saved / target, tidak dibatasi 1 agar UI bisa menandai "tercapai". */
  ratio: number;
  wallet: GoalWalletRef;
  targetDate: Date | null;
  targetYmd: string | null;
  /** Negatif bila tanggal target sudah lewat. */
  daysLeft: number | null;
  /** Perkiraan sisipan per bulan agar target tercapai; null tanpa target tanggal. */
  monthlyNeeded: number | null;
  note: string | null;
  archivedAt: Date | null;
}

export interface GoalInput {
  name: string;
  targetAmount: number;
  walletId: string;
  /** 'YYYY-MM-DD' kalender Jakarta; null = tanpa target tanggal. */
  targetDate?: string | null;
  note?: string | null;
}

export interface GoalPatch {
  name?: string;
  targetAmount?: number;
  walletId?: string;
  targetDate?: string | null;
  note?: string | null;
}

const goalSelection = {
  id: goals.id,
  name: goals.name,
  targetAmount: goals.targetAmount,
  walletId: goals.walletId,
  targetDate: goals.targetDate,
  note: goals.note,
  archivedAt: goals.archivedAt,
  walletName: wallets.name,
  walletIcon: wallets.icon,
  walletType: wallets.type,
  balance: sql<number>`coalesce(${walletBalances.balance}, 0)::bigint`,
};

function dayDiff(fromYmd: string, toYmd: string): number {
  const from = Date.parse(`${fromYmd}T00:00:00.000Z`);
  const to = Date.parse(`${toYmd}T00:00:00.000Z`);
  return Math.round((to - from) / 86_400_000);
}

function mapGoal(row: {
  id: string;
  name: string;
  targetAmount: number;
  walletId: string;
  targetDate: Date | null;
  note: string | null;
  archivedAt: Date | null;
  walletName: string | null;
  walletIcon: string | null;
  walletType: WalletType;
  balance: number;
}): GoalEntry {
  const targetAmount = Number(row.targetAmount);
  const saved = Number(row.balance ?? 0);
  const remaining = Math.max(targetAmount - saved, 0);
  const targetYmd = row.targetDate ? jakartaYmd(row.targetDate) : null;
  const daysLeft = targetYmd ? dayDiff(jakartaYmd(new Date()), targetYmd) : null;
  const monthsLeft =
    daysLeft === null ? null : daysLeft <= 0 ? 1 : Math.max(Math.ceil(daysLeft / 30), 1);

  return {
    id: row.id,
    name: row.name,
    targetAmount,
    saved,
    remaining,
    ratio: targetAmount > 0 ? saved / targetAmount : 0,
    wallet: {
      id: row.walletId,
      name: row.walletName ?? 'Kantong',
      icon: row.walletIcon,
      type: row.walletType,
    },
    targetDate: row.targetDate,
    targetYmd,
    daysLeft,
    monthlyNeeded:
      monthNeeded(remaining, monthsLeft),
    note: row.note,
    archivedAt: row.archivedAt,
  };
}

function monthNeeded(remaining: number, monthsLeft: number | null): number | null {
  if (monthsLeft === null || remaining <= 0) return remaining <= 0 ? 0 : null;
  return Math.ceil(remaining / monthsLeft);
}

export async function listGoals(
  db: AppDb,
  userId: string,
  opts: { includeArchived?: boolean } = {},
): Promise<GoalEntry[]> {
  const rows = await db
    .select(goalSelection)
    .from(goals)
    .innerJoin(wallets, eq(wallets.id, goals.walletId))
    .leftJoin(walletBalances, eq(walletBalances.walletId, goals.walletId))
    .where(
      and(
        eq(goals.userId, userId),
        opts.includeArchived ? undefined : isNull(goals.archivedAt),
      ),
    )
    .orderBy(asc(goals.archivedAt), asc(goals.createdAt));

  return rows.map((row) => mapGoal(row));
}

async function assertGoalWallet(
  db: AppDb,
  userId: string,
  walletId: string,
  exceptGoalId?: string,
): Promise<void> {
  const [wallet] = await db
    .select({ id: wallets.id, type: wallets.type, archivedAt: wallets.archivedAt })
    .from(wallets)
    .where(and(eq(wallets.userId, userId), eq(wallets.id, walletId)))
    .limit(1);
  if (!wallet) throw new ServiceError('Kantong tidak ditemukan');
  if (wallet.archivedAt) throw new ServiceError('Kantong sudah diarsipkan');
  if (wallet.type === 'credit') {
    throw new ServiceError('Kartu kredit tidak bisa dipakai sebagai kantong tujuan');
  }

  const [used] = await db
    .select({ id: goals.id })
    .from(goals)
    .where(
      and(
        eq(goals.userId, userId),
        eq(goals.walletId, walletId),
        isNull(goals.archivedAt),
        exceptGoalId ? ne(goals.id, exceptGoalId) : undefined,
      ),
    )
    .limit(1);
  if (used) throw new ServiceError('Kantong ini sudah dipakai tujuan tabungan lain');
}

function validateName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new ServiceError('Nama tujuan wajib diisi');
  if (trimmed.length > 60) throw new ServiceError('Nama tujuan terlalu panjang');
  return trimmed;
}

function validateTarget(amount: number): number {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new ServiceError('Target tabungan tidak valid');
  }
  return amount;
}

function targetDateFromYmd(ymd?: string | null): Date | null {
  if (!ymd) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) throw new ServiceError('Tanggal target tidak valid');
  return jakartaDateAtNoonUtc(ymd);
}

function validateNote(note?: string | null): string | null {
  if (!note?.trim()) return null;
  if (note.trim().length > 280) throw new ServiceError('Catatan terlalu panjang');
  return note.trim();
}

function isUniqueViolation(error: unknown): boolean {
  const code =
    (error as { code?: string })?.code ?? (error as { cause?: { code?: string } })?.cause?.code;
  return code === '23505';
}

export async function createGoal(
  db: AppDb,
  userId: string,
  input: GoalInput,
): Promise<GoalEntry> {
  const name = validateName(input.name);
  const targetAmount = validateTarget(input.targetAmount);
  await assertGoalWallet(db, userId, input.walletId);

  try {
    const [row] = await db
      .insert(goals)
      .values({
        userId,
        name,
        targetAmount,
        walletId: input.walletId,
        targetDate: targetDateFromYmd(input.targetDate),
        note: validateNote(input.note),
      })
      .returning({ id: goals.id });
    const created = (await listGoals(db, userId)).find((goal) => goal.id === row.id);
    if (!created) throw new ServiceError('Gagal membuat tujuan tabungan');
    return created;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ServiceError('Nama tujuan sudah dipakai atau kantong sudah punya tujuan aktif');
    }
    throw error;
  }
}

export async function updateGoal(
  db: AppDb,
  userId: string,
  goalId: string,
  patch: GoalPatch,
): Promise<GoalEntry> {
  const [existing] = await db
    .select()
    .from(goals)
    .where(and(eq(goals.userId, userId), eq(goals.id, goalId)))
    .limit(1);
  if (!existing) throw new ServiceError('Tujuan tabungan tidak ditemukan');

  const walletId = patch.walletId ?? existing.walletId;
  if (patch.walletId && patch.walletId !== existing.walletId) {
    await assertGoalWallet(db, userId, walletId, goalId);
  }

  try {
    await db
      .update(goals)
      .set({
        ...(patch.name !== undefined ? { name: validateName(patch.name) } : {}),
        ...(patch.targetAmount !== undefined
          ? { targetAmount: validateTarget(patch.targetAmount) }
          : {}),
        ...(patch.walletId !== undefined ? { walletId } : {}),
        ...(patch.targetDate !== undefined
          ? { targetDate: targetDateFromYmd(patch.targetDate) }
          : {}),
        ...(patch.note !== undefined ? { note: validateNote(patch.note) } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(goals.userId, userId), eq(goals.id, goalId)));
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ServiceError('Nama tujuan sudah dipakai atau kantong sudah punya tujuan aktif');
    }
    throw error;
  }

  const updated = (await listGoals(db, userId, { includeArchived: true })).find(
    (goal) => goal.id === goalId,
  );
  if (!updated) throw new ServiceError('Tujuan tabungan tidak ditemukan');
  return updated;
}

export async function setGoalArchived(
  db: AppDb,
  userId: string,
  goalId: string,
  archived: boolean,
): Promise<void> {
  const updated = await db
    .update(goals)
    .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
    .where(and(eq(goals.userId, userId), eq(goals.id, goalId)))
    .returning({ id: goals.id });
  if (updated.length === 0) throw new ServiceError('Tujuan tabungan tidak ditemukan');
}

export async function deleteGoal(
  db: AppDb,
  userId: string,
  goalId: string,
): Promise<void> {
  const removed = await db
    .delete(goals)
    .where(and(eq(goals.userId, userId), eq(goals.id, goalId)))
    .returning({ id: goals.id });
  if (removed.length === 0) throw new ServiceError('Tujuan tabungan tidak ditemukan');
}
