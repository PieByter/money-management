import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  char,
  check,
  index,
  pgTable,
  pgView,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const WALLET_TYPES = ['cash', 'bank', 'ewallet', 'other'] as const;
export const CATEGORY_KINDS = ['income', 'expense'] as const;
export const TRANSACTION_KINDS = [
  'income',
  'expense',
  'transfer_in',
  'transfer_out',
  'adjustment_in',
  'adjustment_out',
] as const;
export const TRANSACTION_SOURCES = ['web', 'telegram', 'whatsapp', 'import'] as const;
export const TRANSACTION_STATUSES = ['draft', 'confirmed'] as const;

export type WalletType = (typeof WALLET_TYPES)[number];
export type CategoryKind = (typeof CATEGORY_KINDS)[number];
export type TransactionKind = (typeof TRANSACTION_KINDS)[number];

export const wallets = pgTable(
  'wallets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    name: text('name').notNull(),
    type: text('type', { enum: WALLET_TYPES }).notNull(),
    color: text('color'),
    icon: text('icon'),
    sortOrder: bigint('sort_order', { mode: 'number' }).notNull().default(0),
    currency: char('currency', { length: 3 }).notNull().default('IDR'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('wallets_user_idx').on(t.userId),
    uniqueIndex('wallets_user_name_uq')
      .on(t.userId, sql`lower(${t.name})`)
      .where(sql`${t.archivedAt} is null`),
    check('wallets_type_check', sql`${t.type} in ('cash','bank','ewallet','other')`),
  ],
);

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    name: text('name').notNull(),
    kind: text('kind', { enum: CATEGORY_KINDS }).notNull(),
    icon: text('icon'),
    color: text('color'),
    sortOrder: bigint('sort_order', { mode: 'number' }).notNull().default(0),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('categories_user_kind_idx').on(t.userId, t.kind),
    uniqueIndex('categories_user_kind_name_uq')
      .on(t.userId, t.kind, sql`lower(${t.name})`)
      .where(sql`${t.archivedAt} is null`),
    check('categories_kind_check', sql`${t.kind} in ('income','expense')`),
  ],
);

export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    walletId: uuid('wallet_id')
      .notNull()
      .references(() => wallets.id),
    kind: text('kind', { enum: TRANSACTION_KINDS }).notNull(),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    categoryId: uuid('category_id').references(() => categories.id),
    groupId: uuid('group_id'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    note: text('note'),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    source: text('source', { enum: TRANSACTION_SOURCES }).notNull().default('web'),
    rawInput: text('raw_input'),
    status: text('status', { enum: TRANSACTION_STATUSES }).notNull().default('confirmed'),
    clientRequestId: uuid('client_request_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('transactions_user_occurred_idx')
      .on(t.userId, t.occurredAt.desc())
      .where(sql`${t.deletedAt} is null`),
    index('transactions_wallet_occurred_idx')
      .on(t.walletId, t.occurredAt)
      .where(sql`${t.deletedAt} is null`),
    index('transactions_group_idx').on(t.groupId),
    unique('transactions_user_client_request_unique').on(t.userId, t.clientRequestId),
    check(
      'transactions_kind_check',
      sql`${t.kind} in ('income','expense','transfer_in','transfer_out','adjustment_in','adjustment_out')`,
    ),
    check('transactions_amount_check', sql`${t.amount} > 0`),
    check('transactions_source_check', sql`${t.source} in ('web','telegram','whatsapp','import')`),
    check('transactions_status_check', sql`${t.status} in ('draft','confirmed')`),
  ],
);

export const budgets = pgTable(
  'budgets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('budgets_user_category_uq').on(t.userId, t.categoryId),
    index('budgets_category_idx').on(t.categoryId),
    check('budgets_amount_check', sql`${t.amount} > 0`),
  ],
);

/**
 * Saldo kantong selalu dihitung dari ledger (bukan kolom yang diedit manual).
 * Hanya transaksi confirmed & belum dihapus yang dihitung.
 */
export const walletBalances = pgView('wallet_balances')
  .with({ securityInvoker: true })
  .as((qb) =>
    qb
      .select({
        walletId: wallets.id,
        userId: wallets.userId,
        balance: sql<number>`coalesce(sum(
          case ${transactions.kind}
            when 'income' then ${transactions.amount}
            when 'transfer_in' then ${transactions.amount}
            when 'adjustment_in' then ${transactions.amount}
            when 'expense' then -${transactions.amount}
            when 'transfer_out' then -${transactions.amount}
            when 'adjustment_out' then -${transactions.amount}
            else 0
          end
        ), 0)::bigint`.as('balance'),
      })
      .from(wallets)
      .leftJoin(
        transactions,
        sql`${transactions.walletId} = ${wallets.id}
            and ${transactions.deletedAt} is null
            and ${transactions.status} = 'confirmed'`,
      )
      .groupBy(wallets.id, wallets.userId),
  );

export type Wallet = typeof wallets.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type Budget = typeof budgets.$inferSelect;
