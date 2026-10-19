import { and, asc, desc, eq, ilike, inArray, isNull, sql } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import { items, transactionItems, transactions, wallets } from '../db/schema';
import { ServiceError } from './errors';

export interface ItemOption {
  id: string;
  name: string;
  unit: string | null;
  lastPrice: number | null;
  categoryId: string | null;
}

export interface TransactionItemLine {
  id: string;
  itemId: string | null;
  name: string;
  qtyMilli: number;
  amount: number;
}

export interface ItemLineInput {
  itemId?: string | null;
  name: string;
  amount: number;
  qtyMilli?: number;
}

const MAX_LINES = 60;

function assertLine(line: ItemLineInput): void {
  if (!line.name.trim()) throw new ServiceError('Nama item wajib diisi');
  if (line.name.trim().length > 60) throw new ServiceError('Nama item terlalu panjang');
  if (!Number.isSafeInteger(line.amount) || line.amount <= 0) {
    throw new ServiceError('Harga item harus lebih dari 0');
  }
  if (line.qtyMilli !== undefined && (!Number.isSafeInteger(line.qtyMilli) || line.qtyMilli <= 0)) {
    throw new ServiceError('Jumlah item tidak valid');
  }
}

/** Katalog item milik user (urut paling sering belanja). */
export async function listItems(
  db: AppDb,
  userId: string,
  opts: { search?: string; limit?: number } = {},
): Promise<ItemOption[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const conditions = [eq(items.userId, userId), isNull(items.archivedAt)];
  if (opts.search?.trim()) conditions.push(ilike(items.name, `%${opts.search.trim()}%`));

  const rows = await db
    .select({
      id: items.id,
      name: items.name,
      unit: items.unit,
      lastPrice: items.lastPrice,
      categoryId: items.categoryId,
    })
    .from(items)
    .where(and(...conditions))
    .orderBy(asc(items.name))
    .limit(limit);

  return rows.map((row) => ({ ...row, lastPrice: row.lastPrice === null ? null : Number(row.lastPrice) }));
}

/** `db.execute` mengembalikan array (postgres-js) atau { rows } (PGlite). */
function rowsOf(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  const rows = (result as { rows?: unknown })?.rows;
  return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
}

/** Item yang paling sering dibeli (90 hari terakhir) untuk chip cepat di sheet. */
export async function getFrequentItems(
  db: AppDb,
  userId: string,
  limit = 12,
): Promise<ItemOption[]> {
  const since = new Date(Date.now() - 90 * 86_400_000);
  const result = await db.execute(sql`
    select i.id, i.name, i.unit, i.last_price, i.category_id
    from items i
    join (
      select ti.item_id, count(*) as usage_count, max(t.occurred_at) as last_at
      from transaction_items ti
      join transactions t on t.id = ti.transaction_id
      where ti.user_id = ${userId}
        and t.deleted_at is null
        and t.occurred_at >= ${since}
        and ti.item_id is not null
      group by ti.item_id
    ) u on u.item_id = i.id
    where i.user_id = ${userId} and i.archived_at is null
    order by u.usage_count desc, u.last_at desc
    limit ${Math.min(Math.max(limit, 1), 40)}
  `);

  return rowsOf(result).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    unit: row.unit === null || row.unit === undefined ? null : String(row.unit),
    lastPrice: row.last_price === null || row.last_price === undefined ? null : Number(row.last_price),
    categoryId:
      row.category_id === null || row.category_id === undefined ? null : String(row.category_id),
  }));
}

/** Rincian item untuk sekumpulan transaksi (dipakai daftar riwayat). */
export async function getItemsByTransactions(
  db: AppDb,
  userId: string,
  transactionIds: string[],
): Promise<Record<string, TransactionItemLine[]>> {
  const ids = [...new Set(transactionIds)];
  if (ids.length === 0) return {};
  const rows = await db
    .select({
      id: transactionItems.id,
      transactionId: transactionItems.transactionId,
      itemId: transactionItems.itemId,
      name: transactionItems.name,
      qtyMilli: transactionItems.qtyMilli,
      amount: transactionItems.amount,
    })
    .from(transactionItems)
    .where(and(eq(transactionItems.userId, userId), inArray(transactionItems.transactionId, ids)))
    .orderBy(asc(transactionItems.createdAt));

  const grouped: Record<string, TransactionItemLine[]> = {};
  for (const row of rows) {
    const line: TransactionItemLine = {
      id: row.id,
      itemId: row.itemId,
      name: row.name,
      qtyMilli: Number(row.qtyMilli),
      amount: Number(row.amount),
    };
    (grouped[row.transactionId] ??= []).push(line);
  }
  return grouped;
}

export async function getTransactionItems(
  db: AppDb,
  userId: string,
  transactionId: string,
): Promise<TransactionItemLine[]> {
  const grouped = await getItemsByTransactions(db, userId, [transactionId]);
  return grouped[transactionId] ?? [];
}

/**
 * Ganti seluruh rincian item sebuah transaksi.
 *
 * Aturan: total rincian **tidak boleh melebihi** nominal transaksi (selisihnya
 * berarti "belum dirinci"), supaya rincian tidak pernah bertentangan dengan
 * ledger.
 */
export async function setTransactionItems(
  db: AppDb,
  userId: string,
  transactionId: string,
  lines: ItemLineInput[],
): Promise<TransactionItemLine[]> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        id: transactions.id,
        amount: transactions.amount,
        kind: transactions.kind,
        categoryId: transactions.categoryId,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.id, transactionId),
          isNull(transactions.deletedAt),
        ),
      )
      .limit(1);
    if (!row) throw new ServiceError('Transaksi tidak ditemukan');
    if (row.kind !== 'expense') {
      throw new ServiceError('Rincian item hanya untuk transaksi pengeluaran');
    }
    return saveItemLines(tx as AppDb, userId, transactionId, row.categoryId, Number(row.amount), lines);
  });
}

/**
 * Simpan rincian item (dipakai `createTransaction`/`updateTransaction` di dalam
 * transaksi DB mereka, dan oleh `setTransactionItems`). Pemanggil bertanggung
 * jawab memastikan transaksi milik user & bertipe expense.
 */
export async function saveItemLines(
  db: AppDb,
  userId: string,
  transactionId: string,
  categoryId: string | null,
  maxTotal: number,
  lines: ItemLineInput[],
): Promise<TransactionItemLine[]> {
  if (lines.length > MAX_LINES) {
    throw new ServiceError(`Maksimal ${MAX_LINES} item per transaksi`);
  }
  const normalized = lines.map((line) => ({
    itemId: line.itemId ?? null,
    name: line.name.trim(),
    amount: line.amount,
    qtyMilli: line.qtyMilli ?? 1000,
  }));
  for (const line of normalized) assertLine(line);

  const total = normalized.reduce((sum, line) => sum + line.amount, 0);
  if (total > maxTotal) {
    throw new ServiceError('Total rincian item melebihi nominal transaksi');
  }

  await db.delete(transactionItems).where(eq(transactionItems.transactionId, transactionId));
  if (normalized.length === 0) return [];

  const providedIds = normalized
    .map((line) => line.itemId)
    .filter((id): id is string => Boolean(id));
  const knownIds = new Set(
    (
      providedIds.length
        ? await db
            .select({ id: items.id })
            .from(items)
            .where(and(eq(items.userId, userId), inArray(items.id, providedIds)))
        : []
    ).map((entry) => entry.id),
  );

  const inserted: TransactionItemLine[] = [];
  for (const line of normalized) {
    const unitPrice = unitPriceOf(line);
    let itemId: string;
    if (line.itemId && knownIds.has(line.itemId)) {
      // Item katalog yang sudah dikenal: perbarui harga terakhirnya agar chip
      // berikutnya menampilkan harga terbaru.
      await db
        .update(items)
        .set({ lastPrice: unitPrice, updatedAt: new Date() })
        .where(and(eq(items.userId, userId), eq(items.id, line.itemId)));
      itemId = line.itemId;
    } else {
      itemId = await upsertItem(db, userId, line, categoryId);
    }
    const [created] = await db
      .insert(transactionItems)
      .values({
        userId,
        transactionId,
        itemId,
        name: line.name,
        qtyMilli: line.qtyMilli,
        amount: line.amount,
      })
      .returning({
        id: transactionItems.id,
        itemId: transactionItems.itemId,
        name: transactionItems.name,
        qtyMilli: transactionItems.qtyMilli,
        amount: transactionItems.amount,
      });
    inserted.push({
      id: created.id,
      itemId: created.itemId,
      name: created.name,
      qtyMilli: Number(created.qtyMilli),
      amount: Number(created.amount),
    });
  }
  return inserted;
}

/** Harga satuan = total baris ÷ jumlah (dibulatkan, minimal Rp 1). */
function unitPriceOf(line: { amount: number; qtyMilli: number }): number {
  return Math.max(Math.round((line.amount * 1000) / line.qtyMilli), 1);
}

/** Cari item katalog berdasarkan nama (case-insensitive); buat bila belum ada. */
async function upsertItem(
  db: AppDb,
  userId: string,
  line: { name: string; amount: number; qtyMilli: number },
  categoryId: string | null,
): Promise<string> {
  const unitPrice = unitPriceOf(line);
  const [existing] = await db
    .select({ id: items.id })
    .from(items)
    .where(
      and(
        eq(items.userId, userId),
        sql`lower(${items.name}) = lower(${line.name})`,
        isNull(items.archivedAt),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(items)
      .set({ lastPrice: unitPrice, categoryId: categoryId ?? undefined, updatedAt: new Date() })
      .where(eq(items.id, existing.id));
    return existing.id;
  }

  const [created] = await db
    .insert(items)
    .values({ userId, name: line.name, lastPrice: unitPrice, categoryId })
    .returning({ id: items.id });
  return created.id;
}

export interface ItemPriceHistoryEntry {
  transactionId: string;
  occurredAt: Date;
  lineAmount: number;
  qtyMilli: number;
  unitPrice: number;
  walletName: string | null;
  note: string | null;
}

/** Riwayat harga satu item: harga satuan per pembelian, terbaru dulu. */
export async function getItemPriceHistory(
  db: AppDb,
  userId: string,
  itemId: string,
  limit = 50,
): Promise<ItemPriceHistoryEntry[]> {
  const rows = await db
    .select({
      transactionId: transactionItems.transactionId,
      occurredAt: transactions.occurredAt,
      amount: transactionItems.amount,
      qtyMilli: transactionItems.qtyMilli,
      walletName: wallets.name,
      note: transactions.note,
    })
    .from(transactionItems)
    .innerJoin(transactions, eq(transactions.id, transactionItems.transactionId))
    .leftJoin(wallets, eq(wallets.id, transactions.walletId))
    .where(
      and(
        eq(transactionItems.userId, userId),
        eq(transactionItems.itemId, itemId),
        isNull(transactions.deletedAt),
      ),
    )
    .orderBy(desc(transactions.occurredAt), desc(transactionItems.createdAt))
    .limit(Math.min(Math.max(limit, 1), 200));

  return rows.map((row) => {
    const qtyMilli = Number(row.qtyMilli);
    const amount = Number(row.amount);
    return {
      transactionId: row.transactionId,
      occurredAt: row.occurredAt,
      lineAmount: amount,
      qtyMilli,
      unitPrice: Math.max(Math.round((amount * 1000) / qtyMilli), 1),
      walletName: row.walletName,
      note: row.note,
    };
  });
}
