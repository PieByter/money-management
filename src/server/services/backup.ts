import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { captureError } from '@/lib/observability';
import type { AppDb } from '../db/client';
import {
  budgetSettings,
  budgets,
  categories,
  channelLinks,
  debtPayments,
  debts,
  goals,
  items,
  transactionItems,
  transactionTemplates,
  transactions,
  wallets,
} from '../db/schema';
import { wipeUserDataTx } from './account';
import { ServiceError } from './errors';

/**
 * Backup/restore JSON. Restore bersifat REPLACE: seluruh data user dihapus
 * lebih dulu, lalu baris dari backup dimasukkan kembali dengan ID aslinya.
 * Ini menjaga relasi (transfer group, item, hutang) tetap utuh.
 */

const rowSchema = z.record(z.string(), z.unknown());

const backupSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string().optional(),
  data: z.object({
    wallets: z.array(rowSchema),
    categories: z.array(rowSchema),
    transactions: z.array(rowSchema),
    transactionItems: z.array(rowSchema),
    items: z.array(rowSchema),
    templates: z.array(rowSchema),
    budgets: z.array(rowSchema),
    budgetSettings: z.array(rowSchema),
    goals: z.array(rowSchema),
    debts: z.array(rowSchema),
    debtPayments: z.array(rowSchema),
    channelLinks: z.array(rowSchema).optional().default([]),
  }),
});

export interface BackupPayload {
  version: 1;
  exportedAt: string;
  data: {
    wallets: unknown[];
    categories: unknown[];
    transactions: unknown[];
    transactionItems: unknown[];
    items: unknown[];
    templates: unknown[];
    budgets: unknown[];
    budgetSettings: unknown[];
    goals: unknown[];
    debts: unknown[];
    debtPayments: unknown[];
    channelLinks: unknown[];
  };
}

export async function exportBackup(db: AppDb, userId: string): Promise<BackupPayload> {
  const [
    walletRows,
    categoryRows,
    transactionRows,
    itemLineRows,
    itemRows,
    templateRows,
    budgetRows,
    budgetSettingRows,
    goalRows,
    debtRows,
    debtPaymentRows,
    channelRows,
  ] = await Promise.all([
    db.select().from(wallets).where(eq(wallets.userId, userId)),
    db.select().from(categories).where(eq(categories.userId, userId)),
    db.select().from(transactions).where(eq(transactions.userId, userId)),
    db.select().from(transactionItems).where(eq(transactionItems.userId, userId)),
    db.select().from(items).where(eq(items.userId, userId)),
    db.select().from(transactionTemplates).where(eq(transactionTemplates.userId, userId)),
    db.select().from(budgets).where(eq(budgets.userId, userId)),
    db.select().from(budgetSettings).where(eq(budgetSettings.userId, userId)),
    db.select().from(goals).where(eq(goals.userId, userId)),
    db.select().from(debts).where(eq(debts.userId, userId)),
    db.select().from(debtPayments).where(eq(debtPayments.userId, userId)),
    db.select().from(channelLinks).where(eq(channelLinks.userId, userId)),
  ]);

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      wallets: walletRows,
      categories: categoryRows,
      transactions: transactionRows,
      transactionItems: itemLineRows,
      items: itemRows,
      templates: templateRows,
      budgets: budgetRows,
      budgetSettings: budgetSettingRows,
      goals: goalRows,
      debts: debtRows,
      debtPayments: debtPaymentRows,
      channelLinks: channelRows,
    },
  };
}

function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ServiceError(`Backup tidak valid: ${field} kosong`);
  }
  return value;
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function numberValue(value: unknown, field: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new ServiceError(`Backup tidak valid: ${field} bukan angka bulat`);
  }
  return parsed;
}

function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateValue(value: unknown, field: string): Date {
  const parsed = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    throw new ServiceError(`Backup tidak valid: ${field} bukan tanggal`);
  }
  return parsed;
}

function optionalDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function textArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function jsonArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export interface RestoreResult {
  wallets: number;
  categories: number;
  transactions: number;
  items: number;
  templates: number;
  goals: number;
  debts: number;
}

export async function restoreBackup(
  db: AppDb,
  userId: string,
  raw: string,
): Promise<RestoreResult> {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    throw new ServiceError('File backup bukan JSON yang valid');
  }
  const parsed = backupSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new ServiceError('Struktur backup tidak dikenali. Gunakan file dari menu Ekspor backup.');
  }
  const { data } = parsed.data;
  const now = new Date();

  try {
    return await db.transaction(async (tx) => {
      const txDb = tx as AppDb;
      await wipeUserDataTx(txDb, userId);

      const walletRows = data.wallets.map((row) => ({
        id: text(row.id, 'wallet.id'),
        userId,
        name: text(row.name, 'wallet.name'),
        type: text(row.type, 'wallet.type'),
        color: optionalText(row.color),
        icon: optionalText(row.icon),
        sortOrder: optionalNumber(row.sortOrder) ?? 0,
        currency: optionalText(row.currency) ?? 'IDR',
        archivedAt: optionalDate(row.archivedAt),
        createdAt: optionalDate(row.createdAt) ?? now,
      }));
      if (walletRows.length > 0) {
        await tx.insert(wallets).values(walletRows as never);
      }

      const categoryRows = data.categories.map((row) => ({
        id: text(row.id, 'category.id'),
        userId,
        name: text(row.name, 'category.name'),
        kind: text(row.kind, 'category.kind'),
        icon: optionalText(row.icon),
        color: optionalText(row.color),
        sortOrder: optionalNumber(row.sortOrder) ?? 0,
        archivedAt: optionalDate(row.archivedAt),
        createdAt: optionalDate(row.createdAt) ?? now,
      }));
      if (categoryRows.length > 0) {
        await tx.insert(categories).values(categoryRows as never);
      }

      const channelLinkRows = data.channelLinks.map((row) => ({
        id: text(row.id, 'channelLink.id'),
        userId,
        channel: optionalText(row.channel) ?? 'telegram',
        externalChatId: text(row.externalChatId, 'channelLink.externalChatId'),
        verifiedAt: optionalDate(row.verifiedAt) ?? now,
        createdAt: optionalDate(row.createdAt) ?? now,
      }));
      if (channelLinkRows.length > 0) {
        await tx.insert(channelLinks).values(channelLinkRows as never);
      }

      const itemRows = data.items.map((row) => ({
        id: text(row.id, 'item.id'),
        userId,
        name: text(row.name, 'item.name'),
        unit: optionalText(row.unit),
        lastPrice: optionalNumber(row.lastPrice),
        categoryId: optionalText(row.categoryId),
        archivedAt: optionalDate(row.archivedAt),
        createdAt: optionalDate(row.createdAt) ?? now,
        updatedAt: optionalDate(row.updatedAt) ?? now,
      }));
      if (itemRows.length > 0) {
        await tx.insert(items).values(itemRows as never);
      }

      const transactionRows = data.transactions.map((row) => ({
        id: text(row.id, 'transaction.id'),
        userId,
        walletId: text(row.walletId, 'transaction.walletId'),
        kind: text(row.kind, 'transaction.kind'),
        amount: numberValue(row.amount, 'transaction.amount'),
        categoryId: optionalText(row.categoryId),
        groupId: optionalText(row.groupId),
        occurredAt: dateValue(row.occurredAt, 'transaction.occurredAt'),
        note: optionalText(row.note),
        tags: textArray(row.tags),
        source: optionalText(row.source) ?? 'import',
        rawInput: optionalText(row.rawInput),
        status: optionalText(row.status) ?? 'confirmed',
        clientRequestId: optionalText(row.clientRequestId),
        createdAt: optionalDate(row.createdAt) ?? now,
        updatedAt: optionalDate(row.updatedAt) ?? now,
        deletedAt: optionalDate(row.deletedAt),
      }));
      if (transactionRows.length > 0) {
        await tx.insert(transactions).values(transactionRows as never);
      }

      const itemLineRows = data.transactionItems.map((row) => ({
        id: text(row.id, 'transactionItem.id'),
        userId,
        transactionId: text(row.transactionId, 'transactionItem.transactionId'),
        itemId: optionalText(row.itemId),
        name: text(row.name, 'transactionItem.name'),
        qtyMilli: numberValue(row.qtyMilli, 'transactionItem.qtyMilli'),
        amount: numberValue(row.amount, 'transactionItem.amount'),
        createdAt: optionalDate(row.createdAt) ?? now,
      }));
      if (itemLineRows.length > 0) {
        await tx.insert(transactionItems).values(itemLineRows as never);
      }

      const templateRows = data.templates.map((row) => ({
        id: text(row.id, 'template.id'),
        userId,
        name: text(row.name, 'template.name'),
        kind: text(row.kind, 'template.kind'),
        amount: numberValue(row.amount, 'template.amount'),
        walletId: text(row.walletId, 'template.walletId'),
        categoryId: optionalText(row.categoryId),
        note: optionalText(row.note),
        tags: textArray(row.tags),
        items: jsonArray(row.items),
        frequency: optionalText(row.frequency) ?? 'none',
        weekday: optionalNumber(row.weekday),
        dayOfMonth: optionalNumber(row.dayOfMonth),
        nextRunAt: optionalDate(row.nextRunAt),
        lastRunAt: optionalDate(row.lastRunAt),
        createdAt: optionalDate(row.createdAt) ?? now,
        updatedAt: optionalDate(row.updatedAt) ?? now,
      }));
      if (templateRows.length > 0) {
        await tx.insert(transactionTemplates).values(templateRows as never);
      }

      const budgetRows = data.budgets.map((row) => ({
        id: text(row.id, 'budget.id'),
        userId,
        categoryId: text(row.categoryId, 'budget.categoryId'),
        amount: numberValue(row.amount, 'budget.amount'),
        enabled: booleanValue(row.enabled, true),
        createdAt: optionalDate(row.createdAt) ?? now,
        updatedAt: optionalDate(row.updatedAt) ?? now,
      }));
      if (budgetRows.length > 0) {
        await tx.insert(budgets).values(budgetRows as never);
      }

      const budgetSettingRows = data.budgetSettings.map((row) => ({
        userId,
        monthlyBudget: numberValue(row.monthlyBudget, 'budgetSettings.monthlyBudget'),
        updatedAt: optionalDate(row.updatedAt) ?? now,
      }));
      if (budgetSettingRows.length > 0) {
        await tx.insert(budgetSettings).values(budgetSettingRows as never);
      }

      const goalRows = data.goals.map((row) => ({
        id: text(row.id, 'goal.id'),
        userId,
        name: text(row.name, 'goal.name'),
        targetAmount: numberValue(row.targetAmount, 'goal.targetAmount'),
        walletId: text(row.walletId, 'goal.walletId'),
        targetDate: optionalDate(row.targetDate),
        note: optionalText(row.note),
        archivedAt: optionalDate(row.archivedAt),
        createdAt: optionalDate(row.createdAt) ?? now,
        updatedAt: optionalDate(row.updatedAt) ?? now,
      }));
      if (goalRows.length > 0) {
        await tx.insert(goals).values(goalRows as never);
      }

      const debtRows = data.debts.map((row) => ({
        id: text(row.id, 'debt.id'),
        userId,
        direction: text(row.direction, 'debt.direction'),
        counterparty: text(row.counterparty, 'debt.counterparty'),
        purpose: optionalText(row.purpose),
        principal: numberValue(row.principal, 'debt.principal'),
        fundingWalletId: text(row.fundingWalletId, 'debt.fundingWalletId'),
        paymentWalletId: text(row.paymentWalletId, 'debt.paymentWalletId'),
        fundingTransactionId: optionalText(row.fundingTransactionId),
        startedAt: dateValue(row.startedAt, 'debt.startedAt'),
        dueAt: optionalDate(row.dueAt),
        note: optionalText(row.note),
        createdAt: optionalDate(row.createdAt) ?? now,
        updatedAt: optionalDate(row.updatedAt) ?? now,
      }));
      if (debtRows.length > 0) {
        await tx.insert(debts).values(debtRows as never);
      }

      const debtPaymentRows = data.debtPayments.map((row) => ({
        id: text(row.id, 'debtPayment.id'),
        userId,
        debtId: text(row.debtId, 'debtPayment.debtId'),
        walletId: text(row.walletId, 'debtPayment.walletId'),
        amount: numberValue(row.amount, 'debtPayment.amount'),
        occurredAt: dateValue(row.occurredAt, 'debtPayment.occurredAt'),
        note: optionalText(row.note),
        transactionId: optionalText(row.transactionId),
        createdAt: optionalDate(row.createdAt) ?? now,
      }));
      if (debtPaymentRows.length > 0) {
        await tx.insert(debtPayments).values(debtPaymentRows as never);
      }

      return {
        wallets: walletRows.length,
        categories: categoryRows.length,
        transactions: transactionRows.length,
        items: itemRows.length,
        templates: templateRows.length,
        goals: goalRows.length,
        debts: debtRows.length,
      };
    });
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    captureError(error, { area: 'backup.restore', userId });
    throw new ServiceError('Gagal memulihkan backup. Pastikan file utuh dan berasal dari aplikasi ini.');
  }
}
