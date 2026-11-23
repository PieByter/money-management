import { z } from 'zod';
import { MAX_AMOUNT } from './money';

/**
 * Satu sumber skema untuk client (react-hook-form), server action, dan
 * (fase 2) webhook ingestion — sesuai PRD 7.1.
 */

export const uuidSchema = z.uuid('ID tidak valid');

export const ymdSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD')
  .refine((value) => {
    const [y, m, d] = value.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return (
      date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
    );
  }, 'Tanggal tidak valid');

export const monthKeySchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Bulan tidak valid');

export const amountSchema = z
  .number({ error: 'Nominal wajib diisi' })
  .int('Nominal harus bilangan bulat')
  .positive('Nominal harus lebih dari 0')
  .max(MAX_AMOUNT, 'Nominal terlalu besar');

export const feeAmountSchema = z
  .number()
  .int()
  .min(0, 'Biaya admin tidak boleh negatif')
  .max(MAX_AMOUNT, 'Nominal terlalu besar');

export const walletTypeSchema = z.enum(['cash', 'bank', 'ewallet', 'other', 'credit']);
export const categoryKindSchema = z.enum(['income', 'expense']);

const nameSchema = z.string().trim().min(1, 'Nama wajib diisi').max(60, 'Nama terlalu panjang');
const noteSchema = z.string().trim().max(280, 'Catatan terlalu panjang');
export const tagSchema = z.string().trim().min(1).max(24);
const tagsSchema = z.array(tagSchema).max(10, 'Maksimal 10 tag');

/** Rincian item pada transaksi (mode belanja itemized). */
export const transactionItemSchema = z.object({
  itemId: uuidSchema.nullish(),
  name: z.string().trim().min(1, 'Nama item wajib diisi').max(60, 'Nama item terlalu panjang'),
  amount: z
    .number()
    .int('Harga item harus bilangan bulat')
    .positive('Harga item harus lebih dari 0')
    .max(MAX_AMOUNT, 'Harga item terlalu besar'),
  qtyMilli: z
    .number()
    .int('Jumlah tidak valid')
    .positive('Jumlah harus lebih dari 0')
    .max(1_000_000, 'Jumlah terlalu besar')
    .optional(),
});

export const transactionItemsSchema = z
  .array(transactionItemSchema)
  .max(60, 'Maksimal 60 item per transaksi');

/** Form tambah/edit transaksi non-transfer. */
export const simpleTransactionSchema = z.object({
  kind: z.enum(['income', 'expense']),
  amount: amountSchema,
  walletId: uuidSchema,
  categoryId: uuidSchema.nullish(),
  date: ymdSchema.nullish(),
  note: noteSchema.nullish(),
  tags: tagsSchema.optional(),
  items: transactionItemsSchema.optional(),
  clientRequestId: uuidSchema.nullish(),
  /** 'receipt' dipakai hasil scan struk; default 'web'. */
  source: z.enum(['web', 'receipt']).optional(),
  /** Metadata hasil scan (JSON ringkas), bukan gambar. */
  rawInput: z.string().trim().max(4000, 'Metadata scan terlalu panjang').nullish(),
});

export const transferSchema = z
  .object({
    fromWalletId: uuidSchema,
    toWalletId: uuidSchema,
    amount: amountSchema,
    feeAmount: feeAmountSchema.optional(),
    feeCategoryId: uuidSchema.nullish(),
    date: ymdSchema.nullish(),
    note: noteSchema.nullish(),
    clientRequestId: uuidSchema.nullish(),
  })
  .refine((value) => value.fromWalletId !== value.toWalletId, {
    message: 'Kantong asal dan tujuan tidak boleh sama',
    path: ['toWalletId'],
  });

export const updateTransactionSchema = z.object({
  transactionId: uuidSchema,
  kind: z.enum(['income', 'expense']).optional(),
  amount: amountSchema.optional(),
  walletId: uuidSchema.optional(),
  categoryId: uuidSchema.nullish(),
  date: ymdSchema.nullish(),
  note: noteSchema.nullish(),
  tags: tagsSchema.optional(),
  items: transactionItemsSchema.optional(),
});

export const updateTransferSchema = z
  .object({
    transactionId: uuidSchema,
    fromWalletId: uuidSchema.optional(),
    toWalletId: uuidSchema.optional(),
    amount: amountSchema.optional(),
    feeAmount: feeAmountSchema.optional(),
    feeCategoryId: uuidSchema.nullish(),
    date: ymdSchema.nullish(),
    note: noteSchema.nullish(),
  })
  .refine(
    (value) =>
      value.fromWalletId === undefined ||
      value.toWalletId === undefined ||
      value.fromWalletId !== value.toWalletId,
    { message: 'Kantong asal dan tujuan tidak boleh sama', path: ['toWalletId'] },
  );

export const templateFrequencySchema = z.enum(['none', 'daily', 'weekly', 'monthly']);

/** Template transaksi: resep yang bisa dipakai ulang (mis. susu + roti tiap Senin). */
export const templateFormSchema = z
  .object({
    id: uuidSchema.optional(),
    name: nameSchema,
    kind: z.enum(['income', 'expense']),
    amount: amountSchema,
    walletId: uuidSchema,
    categoryId: uuidSchema.nullish(),
    note: noteSchema.nullish(),
    tags: tagsSchema.optional(),
    items: transactionItemsSchema.optional(),
    frequency: templateFrequencySchema.default('none'),
    weekday: z
      .number()
      .int()
      .min(1, 'Hari tidak valid')
      .max(7, 'Hari tidak valid')
      .nullish(),
    dayOfMonth: z
      .number()
      .int()
      .min(1, 'Tanggal tidak valid')
      .max(31, 'Tanggal tidak valid')
      .nullish(),
  })
  .superRefine((value, ctx) => {
    if (value.frequency === 'weekly' && !value.weekday) {
      ctx.addIssue({ code: 'custom', path: ['weekday'], message: 'Pilih hari untuk jadwal mingguan' });
    }
    if (value.frequency === 'monthly' && !value.dayOfMonth) {
      ctx.addIssue({
        code: 'custom',
        path: ['dayOfMonth'],
        message: 'Isi tanggal untuk jadwal bulanan',
      });
    }
  });

export const walletFormSchema = z.object({
  name: nameSchema,
  type: walletTypeSchema,
  color: z.string().max(20).nullish(),
  icon: z.string().max(8).nullish(),
  openingBalance: z
    .number()
    .int()
    .min(0, 'Saldo awal tidak boleh negatif')
    .max(MAX_AMOUNT, 'Nominal terlalu besar')
    .optional(),
  creditLimit: z
    .number()
    .int()
    .positive('Limit harus lebih dari 0')
    .max(MAX_AMOUNT, 'Nominal terlalu besar')
    .nullish(),
  statementDay: z.number().int().min(1).max(31).nullish(),
  dueDay: z.number().int().min(1).max(31).nullish(),
});

export const categoryFormSchema = z.object({
  name: nameSchema,
  kind: categoryKindSchema,
  icon: z.string().max(8).nullish(),
  color: z.string().max(20).nullish(),
});

export const budgetFormSchema = z.object({
  categoryId: uuidSchema,
  amount: amountSchema,
});

export const budgetToggleSchema = z.object({
  categoryId: uuidSchema,
  enabled: z.boolean(),
});

export const monthlyBudgetSchema = z.object({
  amount: amountSchema,
});

export const reconcileSchema = z.object({
  walletId: uuidSchema,
  actualBalance: z
    .number()
    .int('Saldo harus bilangan bulat')
    .min(-MAX_AMOUNT)
    .max(MAX_AMOUNT, 'Nominal terlalu besar'),
  note: noteSchema.nullish(),
});

export const goalFormSchema = z.object({
  id: uuidSchema.optional(),
  name: nameSchema,
  targetAmount: amountSchema,
  walletId: uuidSchema,
  targetDate: ymdSchema.nullish(),
  note: noteSchema.nullish(),
});

export const goalArchiveSchema = z.object({
  goalId: uuidSchema,
  archived: z.boolean(),
});

/** Hutang (`payable`) atau piutang (`receivable`). */
export const debtDirectionSchema = z.enum(['payable', 'receivable']);

const debtPartySchema = z
  .string()
  .trim()
  .min(1, 'Nama pihak wajib diisi')
  .max(80, 'Nama terlalu panjang');
const debtPurposeSchema = z.string().trim().max(160, 'Tujuan terlalu panjang');

export const debtFormSchema = z.object({
  direction: debtDirectionSchema,
  counterparty: debtPartySchema,
  purpose: debtPurposeSchema.nullish(),
  principal: amountSchema,
  /** Kantong tempat uang pinjaman masuk (hutang) / keluar (piutang). */
  fundingWalletId: uuidSchema,
  /** Kantong default untuk angsuran & pelunasan. */
  paymentWalletId: uuidSchema,
  date: ymdSchema.nullish(),
  dueDate: ymdSchema.nullish(),
  note: noteSchema.nullish(),
});

export const debtUpdateSchema = z.object({
  debtId: uuidSchema,
  counterparty: debtPartySchema.optional(),
  purpose: debtPurposeSchema.nullish(),
  paymentWalletId: uuidSchema.optional(),
  dueDate: ymdSchema.nullish(),
  note: noteSchema.nullish(),
});

export const debtPaymentSchema = z.object({
  debtId: uuidSchema,
  amount: amountSchema,
  walletId: uuidSchema,
  date: ymdSchema.nullish(),
  note: noteSchema.nullish(),
});

export const debtSettleSchema = z.object({
  debtId: uuidSchema,
  walletId: uuidSchema,
  date: ymdSchema.nullish(),
  note: noteSchema.nullish(),
});

/** Payload scan struk: base64 tanpa prefix data URL. */
export const receiptScanInputSchema = z.object({
  imageBase64: z
    .string()
    .min(100, 'Gambar kosong atau rusak')
    .max(6_500_000, 'Gambar terlalu besar — pilih foto lain'),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']),
});

/** Satu baris CSV yang sudah dinormalisasi di client sebelum dikirim ke server. */
export const csvImportRowSchema = z.object({
  date: ymdSchema,
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Jam harus HH:mm')
    .nullish(),
  kind: z.enum([
    'income',
    'expense',
    'transfer_in',
    'transfer_out',
    'adjustment_in',
    'adjustment_out',
  ]),
  walletName: z.string().trim().min(1, 'Nama kantong wajib diisi').max(60),
  categoryName: z.string().trim().max(60).nullish(),
  amount: amountSchema,
  note: noteSchema.nullish(),
  tags: tagsSchema.optional(),
  groupId: uuidSchema.nullish(),
});

export const csvImportInputSchema = z.object({
  rows: z.array(csvImportRowSchema).min(1, 'Tidak ada baris untuk diimpor').max(5000, 'Maksimal 5000 baris'),
});

export const listTransactionsSchema = z.object({
  month: monthKeySchema.nullish(),
  walletId: uuidSchema.nullish(),
  categoryId: uuidSchema.nullish(),
  kind: z.enum(['income', 'expense', 'transfer', 'adjustment']).nullish(),
  tag: tagSchema.nullish(),
  search: z.string().trim().max(120).nullish(),
  cursor: z.string().max(80).nullish(),
  limit: z.number().int().min(1).max(100).optional(),
});

export type SimpleTransactionInputSchema = z.infer<typeof simpleTransactionSchema>;
export type TransferInputSchema = z.infer<typeof transferSchema>;
export type WalletFormValues = z.infer<typeof walletFormSchema>;
export type CategoryFormValues = z.infer<typeof categoryFormSchema>;
export type ReconcileValues = z.infer<typeof reconcileSchema>;
export type ListTransactionsValues = z.infer<typeof listTransactionsSchema>;
export type DebtFormValues = z.infer<typeof debtFormSchema>;
export type TemplateFormValues = z.infer<typeof templateFormSchema>;
export type CsvImportRow = z.infer<typeof csvImportRowSchema>;
