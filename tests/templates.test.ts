import { randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AppDb } from '@/server/db/client';
import { transactionTemplates } from '@/server/db/schema';
import { listCategories } from '@/server/services/categories';
import { ensureDefaults } from '@/server/services/defaults';
import { getTransactionItems } from '@/server/services/items';
import {
  applyTemplate,
  createTemplate,
  deleteTemplate,
  listTemplates,
  runDueTemplates,
  updateTemplate,
} from '@/server/services/templates';
import {
  getTransactionDetail,
  listTransactions,
  ServiceError,
} from '@/server/services/transactions';
import { listWallets } from '@/server/services/wallets';
import { jakartaStartOfDayUtc, jakartaYmd } from '@/lib/dates';
import { nextRunYmd, scheduleLabel } from '@/lib/template-schedule';

const WIB = 7 * 60 * 60 * 1000;

/** Instant pada jam WIB tertentu (untuk tanggal & jam yang deterministik). */
function wibAt(year: number, month: number, day: number, hour = 10, minute = 0): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - WIB);
}

describe('jadwal template', () => {
  it('mingguan: Senin berikutnya setelah hari Selasa', () => {
    expect(nextRunYmd({ frequency: 'weekly', weekday: 1, dayOfMonth: null }, '2026-10-27')).toBe(
      '2026-11-02',
    );
  });

  it('mingguan: hari yang sama digeser satu minggu (bukan hari ini)', () => {
    expect(nextRunYmd({ frequency: 'weekly', weekday: 1, dayOfMonth: null }, '2026-10-26')).toBe(
      '2026-11-02',
    );
  });

  it('bulanan: tanggal 31 jatuh ke akhir bulan yang lebih pendek', () => {
    expect(nextRunYmd({ frequency: 'monthly', weekday: null, dayOfMonth: 31 }, '2026-01-31')).toBe(
      '2026-02-28',
    );
    expect(nextRunYmd({ frequency: 'monthly', weekday: null, dayOfMonth: 31 }, '2026-01-15')).toBe(
      '2026-01-31',
    );
  });

  it('harian & label jadwal', () => {
    expect(nextRunYmd({ frequency: 'daily', weekday: null, dayOfMonth: null }, '2026-10-31')).toBe(
      '2026-11-01',
    );
    expect(nextRunYmd({ frequency: 'none', weekday: null, dayOfMonth: null }, '2026-10-31')).toBeNull();
    expect(scheduleLabel({ frequency: 'weekly', weekday: 1, dayOfMonth: null })).toBe(
      'Setiap Senin',
    );
    expect(scheduleLabel({ frequency: 'monthly', weekday: null, dayOfMonth: 5 })).toBe(
      'Setiap tanggal 5',
    );
  });
});

describe('template transaksi', () => {
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

  async function newContext() {
    const userId = randomUUID();
    await ensureDefaults(db, userId);
    const [wallets, categories] = await Promise.all([
      listWallets(db, userId),
      listCategories(db, userId),
    ]);
    const expense = categories.find((category) => category.kind === 'expense');
    const income = categories.find((category) => category.kind === 'income');
    if (!expense || !income || wallets.length === 0) {
      throw new Error('Seed default tidak lengkap');
    }
    return {
      userId,
      walletId: wallets[0].id,
      expenseCategoryId: expense.id,
      incomeCategoryId: income.id,
    };
  }

  it('menyimpan template mingguan beserta rincian item dan jadwal berikutnya', async () => {
    const { userId, walletId, expenseCategoryId } = await newContext();
    const template = await createTemplate(
      db,
      userId,
      {
        name: 'Susu + roti',
        kind: 'expense',
        amount: 15_000,
        walletId,
        categoryId: expenseCategoryId,
        tags: ['sarapan'],
        items: [
          { name: 'Susu', amount: 8_000 },
          { name: 'Roti', amount: 7_000 },
        ],
        frequency: 'weekly',
        weekday: 1,
      },
      wibAt(2026, 10, 27),
    );

    expect(template.frequency).toBe('weekly');
    expect(template.weekday).toBe(1);
    expect(template.items).toHaveLength(2);
    expect(template.nextRunAt?.toISOString()).toBe(
      jakartaStartOfDayUtc('2026-11-02').toISOString(),
    );
  });

  it('menolak jadwal mingguan tanpa hari & rincian yang melebihi nominal', async () => {
    const { userId, walletId, expenseCategoryId } = await newContext();
    const base = {
      name: 'Validasi',
      kind: 'expense' as const,
      amount: 10_000,
      walletId,
      categoryId: expenseCategoryId,
    };

    await expect(
      createTemplate(db, userId, { ...base, frequency: 'weekly', weekday: null }),
    ).rejects.toThrow('Pilih hari');

    await expect(
      createTemplate(db, userId, {
        ...base,
        items: [{ name: 'Mahal', amount: 20_000 }],
      }),
    ).rejects.toThrow('melebihi nominal');
  });

  it('menolak nama template yang sudah dipakai', async () => {
    const { userId, walletId } = await newContext();
    const input = {
      name: 'Kopi',
      kind: 'expense' as const,
      amount: 5_000,
      walletId,
    };
    await createTemplate(db, userId, input);
    await expect(createTemplate(db, userId, input)).rejects.toThrow();
  });

  it('mendaftar template lengkap dengan nama kantong & kategori', async () => {
    const { userId, walletId, expenseCategoryId } = await newContext();
    await createTemplate(db, userId, {
      name: 'Belanja mingguan',
      kind: 'expense',
      amount: 50_000,
      walletId,
      categoryId: expenseCategoryId,
    });

    const templates = await listTemplates(db, userId);
    expect(templates).toHaveLength(1);
    expect(templates[0].walletName).toBeTruthy();
    expect(templates[0].categoryName).toBeTruthy();
    expect(templates[0].nextRunYmd).toBeNull();
  });

  it('mencatat transaksi dari template (source template + rincian item)', async () => {
    const { userId, walletId, expenseCategoryId } = await newContext();
    const template = await createTemplate(db, userId, {
      name: 'Susu + roti',
      kind: 'expense',
      amount: 15_000,
      walletId,
      categoryId: expenseCategoryId,
      tags: ['sarapan'],
      items: [
        { name: 'Susu', amount: 8_000 },
        { name: 'Roti', amount: 7_000 },
      ],
    });

    const { transactionId } = await applyTemplate(db, userId, template.id, {
      occurredAt: wibAt(2026, 10, 27, 9),
    });
    const detail = await getTransactionDetail(db, userId, transactionId);
    expect(detail?.transaction.source).toBe('template');
    expect(detail?.transaction.note).toBe('Susu + roti');
    expect(detail?.transaction.tags).toEqual(['sarapan']);

    const items = await getTransactionItems(db, userId, transactionId);
    expect(items.map((line) => line.name)).toEqual(['Susu', 'Roti']);
  });

  it('template pemasukan tidak menyimpan rincian item', async () => {
    const { userId, walletId, incomeCategoryId } = await newContext();
    const template = await createTemplate(db, userId, {
      name: 'Gaji bulanan',
      kind: 'income',
      amount: 5_000_000,
      walletId,
      categoryId: incomeCategoryId,
      items: [{ name: 'Diabaikan', amount: 1_000 }],
    });
    expect(template.items).toEqual([]);

    const { transactionId } = await applyTemplate(db, userId, template.id);
    const detail = await getTransactionDetail(db, userId, transactionId);
    expect(detail?.transaction.kind).toBe('income');
  });

  it('posting otomatis sekali per jadwal, lalu maju ke jadwal berikutnya', async () => {
    const { userId, walletId } = await newContext();
    const template = await createTemplate(
      db,
      userId,
      {
        name: 'Susu + roti',
        kind: 'expense',
        amount: 15_000,
        walletId,
        items: [{ name: 'Susu', amount: 15_000 }],
        frequency: 'weekly',
        weekday: 1,
      },
      wibAt(2026, 10, 27),
    );

    // Senin 2 Nov 2026, setelah pukul 00:00 WIB.
    const monday = wibAt(2026, 11, 2, 8);
    const first = await runDueTemplates(db, userId, monday);
    expect(first.created).toBe(1);

    const { items } = await listTransactions(db, userId, { limit: 10 });
    const posted = items.find((item) => item.source === 'template');
    expect(posted).toBeTruthy();
    expect(jakartaYmd(posted!.occurredAt)).toBe('2026-11-02');

    const [row] = await db
      .select()
      .from(transactionTemplates)
      .where(eq(transactionTemplates.id, template.id));
    expect(row.nextRunAt && jakartaYmd(row.nextRunAt)).toBe('2026-11-09');
    expect(row.lastRunAt?.toISOString()).toBe(jakartaStartOfDayUtc('2026-11-02').toISOString());

    // Dijalankan lagi pada hari yang sama: tidak boleh dobel.
    const second = await runDueTemplates(db, userId, monday);
    expect(second.created).toBe(0);
    const after = await listTransactions(db, userId, { limit: 10 });
    expect(after.items.filter((item) => item.source === 'template')).toHaveLength(1);
  });

  it('kemunculan yang terlalu lama dilewati tanpa membanjiri ledger', async () => {
    const { userId, walletId } = await newContext();
    const template = await createTemplate(db, userId, {
      name: 'Langganan',
      kind: 'expense',
      amount: 20_000,
      walletId,
      frequency: 'monthly',
      dayOfMonth: 5,
    });
    await db
      .update(transactionTemplates)
      .set({ nextRunAt: jakartaStartOfDayUtc('2026-06-05') })
      .where(eq(transactionTemplates.id, template.id));

    const result = await runDueTemplates(db, userId, wibAt(2026, 10, 27));
    // Jun–Sep dilewati (di luar 31 hari terakhir), hanya 5 Okt yang dicatat.
    expect(result.created).toBe(1);
    expect(result.skipped).toBe(4);

    const { items } = await listTransactions(db, userId, { limit: 10 });
    expect(items).toHaveLength(1);
    expect(jakartaYmd(items[0].occurredAt)).toBe('2026-10-05');

    const [row] = await db
      .select()
      .from(transactionTemplates)
      .where(eq(transactionTemplates.id, template.id));
    expect(row.nextRunAt && jakartaYmd(row.nextRunAt)).toBe('2026-11-05');
  });

  it('mengubah jadwal menghitung ulang kemunculan berikutnya', async () => {
    const { userId, walletId } = await newContext();
    const template = await createTemplate(
      db,
      userId,
      { name: 'Template', kind: 'expense', amount: 1_000, walletId },
      wibAt(2026, 10, 27),
    );
    expect(template.nextRunAt).toBeNull();

    const updated = await updateTemplate(
      db,
      userId,
      template.id,
      {
        name: 'Template',
        kind: 'expense',
        amount: 2_000,
        walletId,
        frequency: 'weekly',
        weekday: 3,
      },
      wibAt(2026, 10, 27),
    );
    expect(updated.amount).toBe(2_000);
    expect(updated.nextRunAt && jakartaYmd(updated.nextRunAt)).toBe('2026-10-28');
  });

  it('menghapus template membuatnya tidak bisa dipakai lagi', async () => {
    const { userId, walletId } = await newContext();
    const template = await createTemplate(db, userId, {
      name: 'Sekali pakai',
      kind: 'expense',
      amount: 1_000,
      walletId,
    });

    await deleteTemplate(db, userId, template.id);
    expect(await listTemplates(db, userId)).toHaveLength(0);
    await expect(applyTemplate(db, userId, template.id)).rejects.toBeInstanceOf(ServiceError);
  });
});
