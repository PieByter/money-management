import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  char,
  check,
  index,
  jsonb,
  pgTable,
  pgView,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { TEMPLATE_FREQUENCIES } from '@/lib/template-schedule';
import type { TemplateItemLine } from '@/lib/view-types';

export const WALLET_TYPES = ['cash', 'bank', 'ewallet', 'other', 'credit'] as const;
export const CATEGORY_KINDS = ['income', 'expense'] as const;
export const TRANSACTION_KINDS = [
  'income',
  'expense',
  'transfer_in',
  'transfer_out',
  'adjustment_in',
  'adjustment_out',
] as const;
export const TRANSACTION_SOURCES = ['web', 'telegram', 'whatsapp', 'import', 'template', 'receipt'] as const;
export const TRANSACTION_STATUSES = ['draft', 'confirmed'] as const;
/**
 * `payable` = hutang (uang yang saya pinjam), `receivable` = piutang
 * (uang yang saya pinjamkan).
 */
export const DEBT_DIRECTIONS = ['payable', 'receivable'] as const;

export type WalletType = (typeof WALLET_TYPES)[number];
export type CategoryKind = (typeof CATEGORY_KINDS)[number];
export type TransactionKind = (typeof TRANSACTION_KINDS)[number];
export type TransactionSource = (typeof TRANSACTION_SOURCES)[number];
export type DebtDirection = (typeof DEBT_DIRECTIONS)[number];

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
    /** Khusus tipe `credit`: limit, tanggal statement, dan tanggal jatuh tempo. */
    creditLimit: bigint('credit_limit', { mode: 'number' }),
    statementDay: smallint('statement_day'),
    dueDay: smallint('due_day'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('wallets_user_idx').on(t.userId),
    uniqueIndex('wallets_user_name_uq')
      .on(t.userId, sql`lower(${t.name})`)
      .where(sql`${t.archivedAt} is null`),
    check(
      'wallets_type_check',
      sql`${t.type} in ('cash','bank','ewallet','other','credit')`,
    ),
    check('wallets_credit_limit_check', sql`${t.creditLimit} is null or ${t.creditLimit} > 0`),
    check(
      'wallets_statement_day_check',
      sql`${t.statementDay} is null or (${t.statementDay} between 1 and 31)`,
    ),
    check(
      'wallets_due_day_check',
      sql`${t.dueDay} is null or (${t.dueDay} between 1 and 31)`,
    ),
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
    check('transactions_source_check', sql`${t.source} in ('web','telegram','whatsapp','import','template','receipt')`),
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
 * Pagu belanja total per bulan (opsional). Budget per kategori tetap disimpan
 * di `budgets`; baris ini hanya menambah satu angka "pagu bulanan" yang dipakai
 * untuk menghitung sisa aman per hari.
 */
export const budgetSettings = pgTable(
  'budget_settings',
  {
    userId: uuid('user_id').primaryKey(),
    monthlyBudget: bigint('monthly_budget', { mode: 'number' }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('budget_settings_amount_check', sql`${t.monthlyBudget} > 0`)],
);

/**
 * Katalog item yang bisa dipakai ulang saat belanja (mode itemized).
 * `lastPrice` menyimpan harga terakhir agar entri berikutnya tinggal tap.
 */
export const items = pgTable(
  'items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    name: text('name').notNull(),
    unit: text('unit'),
    lastPrice: bigint('last_price', { mode: 'number' }),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('items_user_name_uq')
      .on(t.userId, sql`lower(${t.name})`)
      .where(sql`${t.archivedAt} is null`),
    index('items_user_idx').on(t.userId),
    index('items_category_idx').on(t.categoryId),
    check('items_last_price_check', sql`${t.lastPrice} is null or ${t.lastPrice} > 0`),
  ],
);

/**
 * Rincian item pada satu transaksi. `name` disalin sebagai snapshot supaya
 * riwayat tetap utuh walau item katalognya dihapus; `amount` = total baris
 * (integer rupiah) dan `qtyMilli` = jumlah × 1000 agar bebas float.
 */
export const transactionItems = pgTable(
  'transaction_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id').references(() => items.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    qtyMilli: bigint('qty_milli', { mode: 'number' }).notNull().default(1000),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('transaction_items_transaction_idx').on(t.transactionId),
    index('transaction_items_item_idx').on(t.itemId),
    index('transaction_items_user_idx').on(t.userId),
    check('transaction_items_amount_check', sql`${t.amount} > 0`),
    check('transaction_items_qty_check', sql`${t.qtyMilli} > 0`),
  ],
);

/**
 * Template transaksi: "resep" transaksi yang sering diulang, mis. susu + roti
 * Rp 15.000 tiap Senin. Dua cara pakai:
 *   * manual — sekali tap langsung mengisi form / mencatat transaksi;
 *   * otomatis — `frequency` ≠ 'none' membuat `next_run_at` diproses saat
 *     aplikasi dibuka, lalu transaksi dibuat dengan tanggal jadwalnya.
 *
 * `items` disimpan sebagai jsonb (snapshot) karena rincian template bukan
 * bagian dari ledger; saat dipakai barulah baris `transaction_items` dibuat.
 */
export const transactionTemplates = pgTable(
  'transaction_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    name: text('name').notNull(),
    kind: text('kind', { enum: CATEGORY_KINDS }).notNull(),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    walletId: uuid('wallet_id')
      .notNull()
      .references(() => wallets.id),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    note: text('note'),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    items: jsonb('items')
      .$type<TemplateItemLine[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    frequency: text('frequency', { enum: TEMPLATE_FREQUENCIES }).notNull().default('none'),
    /** Senin = 1 … Minggu = 7; hanya dipakai untuk `frequency` = 'weekly'. */
    weekday: smallint('weekday'),
    /** 1-31; hanya dipakai untuk `frequency` = 'monthly'. */
    dayOfMonth: smallint('day_of_month'),
    nextRunAt: timestamp('next_run_at', { withTimezone: true }),
    lastRunAt: timestamp('last_run_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('transaction_templates_user_name_uq').on(t.userId, sql`lower(${t.name})`),
    index('transaction_templates_user_idx').on(t.userId),
    index('transaction_templates_due_idx')
      .on(t.nextRunAt)
      .where(sql`${t.nextRunAt} is not null`),
    check(
      'transaction_templates_kind_check',
      sql`${t.kind} in ('income','expense')`,
    ),
    check('transaction_templates_amount_check', sql`${t.amount} > 0`),
    check(
      'transaction_templates_frequency_check',
      sql`${t.frequency} in ('none','daily','weekly','monthly')`,
    ),
    check(
      'transaction_templates_weekday_check',
      sql`${t.weekday} is null or (${t.weekday} between 1 and 7)`,
    ),
    check(
      'transaction_templates_day_check',
      sql`${t.dayOfMonth} is null or (${t.dayOfMonth} between 1 and 31)`,
    ),
  ],
);

/**
 * Tujuan tabungan (mis. dana darurat, liburan). Progres tidak disimpan sebagai
 * kolom: selalu dihitung dari saldo kantong yang ditautkan, sehingga konsisten
 * dengan ledger. Satu kantong hanya boleh menjadi sumber satu goal aktif.
 */
export const goals = pgTable(
  'goals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    name: text('name').notNull(),
    targetAmount: bigint('target_amount', { mode: 'number' }).notNull(),
    walletId: uuid('wallet_id')
      .notNull()
      .references(() => wallets.id),
    targetDate: timestamp('target_date', { withTimezone: true }),
    note: text('note'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('goals_user_idx').on(t.userId),
    index('goals_wallet_idx').on(t.walletId),
    uniqueIndex('goals_user_name_uq')
      .on(t.userId, sql`lower(${t.name})`)
      .where(sql`${t.archivedAt} is null`),
    uniqueIndex('goals_active_wallet_uq')
      .on(t.userId, t.walletId)
      .where(sql`${t.archivedAt} is null`),
    check('goals_target_check', sql`${t.targetAmount} > 0`),
  ],
);

/**
 * Hutang & piutang (debt). Satu baris = satu perjanjian pinjaman.
 *
 * Alur uangnya selalu dua kantong berbeda, persis seperti kasus nyata
 * "pinjam dari Bank Jago, lunasi dari Dana":
 *   * `fundingWalletId` — kantong tempat uang pinjaman masuk (hutang) atau
 *     keluar (piutang). Dicatat sebagai transaksi `income`/`expense` dan
 *     id-nya disimpan di `fundingTransactionId`.
 *   * `paymentWalletId` — kantong default untuk angsuran/pelunasan.
 *
 * Status lunas **tidak** disimpan sebagai kolom: selalu dihitung dari
 * `debt_payments` supaya tidak bisa melenceng dari ledger.
 */
export const debts = pgTable(
  'debts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    direction: text('direction', { enum: DEBT_DIRECTIONS }).notNull(),
    counterparty: text('counterparty').notNull(),
    purpose: text('purpose'),
    principal: bigint('principal', { mode: 'number' }).notNull(),
    fundingWalletId: uuid('funding_wallet_id')
      .notNull()
      .references(() => wallets.id),
    paymentWalletId: uuid('payment_wallet_id')
      .notNull()
      .references(() => wallets.id),
    fundingTransactionId: uuid('funding_transaction_id').references(() => transactions.id, {
      onDelete: 'set null',
    }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    dueAt: timestamp('due_at', { withTimezone: true }),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('debts_user_idx').on(t.userId),
    index('debts_user_direction_idx').on(t.userId, t.direction),
    index('debts_funding_wallet_idx').on(t.fundingWalletId),
    index('debts_payment_wallet_idx').on(t.paymentWalletId),
    index('debts_funding_transaction_idx').on(t.fundingTransactionId),
    check('debts_direction_check', sql`${t.direction} in ('payable','receivable')`),
    check('debts_principal_check', sql`${t.principal} > 0`),
  ],
);

/**
 * Satu pembayaran/angsuran sebuah debt. Selalu terhubung 1:1 dengan transaksi
 * ledger (`transaction_id`), jadi pembayaran yang transaksinya dihapus dari
 * Riwayat otomatis tidak dihitung lagi sebagai pelunasan.
 */
export const debtPayments = pgTable(
  'debt_payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    debtId: uuid('debt_id')
      .notNull()
      .references(() => debts.id, { onDelete: 'cascade' }),
    walletId: uuid('wallet_id')
      .notNull()
      .references(() => wallets.id),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    note: text('note'),
    transactionId: uuid('transaction_id').references(() => transactions.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('debt_payments_debt_idx').on(t.debtId),
    index('debt_payments_user_idx').on(t.userId),
    index('debt_payments_wallet_idx').on(t.walletId),
    index('debt_payments_transaction_idx').on(t.transactionId),
    check('debt_payments_amount_check', sql`${t.amount} > 0`),
  ],
);

export const CHANNELS = ['telegram', 'whatsapp'] as const;
export type Channel = (typeof CHANNELS)[number];

/**
 * Tautan identitas chat eksternal ke user aplikasi. Hanya chat yang sudah
 * memverifikasi token (`/start <token>`) yang boleh mencatat transaksi.
 */
export const channelLinks = pgTable(
  'channel_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    channel: text('channel', { enum: CHANNELS }).notNull().default('telegram'),
    externalChatId: text('external_chat_id').notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('channel_links_chat_uq').on(t.channel, t.externalChatId),
    uniqueIndex('channel_links_user_channel_uq').on(t.userId, t.channel),
    index('channel_links_user_idx').on(t.userId),
    check('channel_links_channel_check', sql`${t.channel} in ('telegram','whatsapp')`),
  ],
);

/** Token sekali pakai untuk menautkan chat (kedaluwarsa cepat). */
export const channelLinkTokens = pgTable(
  'channel_link_tokens',
  {
    token: text('token').primaryKey(),
    userId: uuid('user_id').notNull(),
    channel: text('channel', { enum: CHANNELS }).notNull().default('telegram'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('channel_link_tokens_user_idx').on(t.userId)],
);

/**
 * Log pesan masuk untuk idempotensi webhook. Telegram bisa mengirim ulang
 * update yang sama; unique `(channel, external_message_id)` mencegah transaksi
 * ganda.
 */
export const ingestEvents = pgTable(
  'ingest_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id'),
    channel: text('channel', { enum: CHANNELS }).notNull().default('telegram'),
    externalMessageId: text('external_message_id').notNull(),
    payload: jsonb('payload').$type<unknown>().notNull(),
    parsed: jsonb('parsed').$type<unknown>(),
    status: text('status', { enum: ['received', 'processed', 'error', 'ignored'] })
      .notNull()
      .default('received'),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('ingest_events_message_uq').on(t.channel, t.externalMessageId),
    index('ingest_events_user_idx').on(t.userId),
    check(
      'ingest_events_status_check',
      sql`${t.status} in ('received','processed','error','ignored')`,
    ),
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
export type Item = typeof items.$inferSelect;
export type TransactionItem = typeof transactionItems.$inferSelect;
export type TransactionTemplate = typeof transactionTemplates.$inferSelect;
export type Debt = typeof debts.$inferSelect;
export type DebtPayment = typeof debtPayments.$inferSelect;
