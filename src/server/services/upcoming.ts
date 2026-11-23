import { and, asc, eq, isNotNull, lte, ne } from 'drizzle-orm';
import { jakartaDateAtNoonUtc, jakartaYmd } from '@/lib/dates';
import { formatIdr } from '@/lib/money';
import type { AppDb } from '../db/client';
import { categories, transactionTemplates, wallets, type TransactionTemplate } from '../db/schema';
import { listDebts } from './debts';
import { listWallets } from './wallets';

export type UpcomingKind = 'template' | 'debt' | 'credit';

export interface UpcomingItem {
  id: string;
  kind: UpcomingKind;
  /** Judul singkat, mis. nama template atau "Bayar Bank Jago". */
  title: string;
  subtitle: string;
  amount: number;
  date: Date;
  ymd: string;
  /** Negatif = sudah terlewat. */
  daysUntil: number;
  overdue: boolean;
  href: string;
  icon: string;
  direction?: 'payable' | 'receivable';
}

function dayDiff(fromYmd: string, toYmd: string): number {
  const from = Date.parse(`${fromYmd}T00:00:00.000Z`);
  const to = Date.parse(`${toYmd}T00:00:00.000Z`);
  return Math.round((to - from) / 86_400_000);
}

/** Tanggal jatuh tempo berikutnya untuk `day` (1-31), dihitung dari hari ini. */
function nextDueYmd(day: number, todayYmd: string): string {
  const [year, month] = todayYmd.split('-').map(Number);
  const thisMonthLast = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const thisCandidate = `${year}-${String(month).padStart(2, '0')}-${String(
    Math.min(day, thisMonthLast),
  ).padStart(2, '0')}`;
  if (thisCandidate >= todayYmd) return thisCandidate;

  const total = year * 12 + month; // bulan berikutnya (0-based +1)
  const nextYear = Math.floor(total / 12);
  const nextMonth = (total % 12) + 1;
  const nextLast = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate();
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(
    Math.min(day, nextLast),
  ).padStart(2, '0')}`;
}

interface TemplateUpcomingRow {
  template: TransactionTemplate;
  walletName: string | null;
  walletIcon: string | null;
  categoryName: string | null;
}

/**
 * Gabungan hal yang akan jatuh tempo dalam beberapa hari ke depan:
 *   * template transaksi terjadwal (`next_run_at`);
 *   * hutang/piutang berjalan yang punya `due_at`.
 *
 * Yang sudah terlewat tetap ditampilkan (daysUntil negatif) supaya user bisa
 * segera bertindak, bukan malah menghilang dari layar.
 */
export async function getUpcoming(
  db: AppDb,
  userId: string,
  opts: { horizonDays?: number; now?: Date } = {},
): Promise<UpcomingItem[]> {
  const now = opts.now ?? new Date();
  const horizonDays = opts.horizonDays ?? 14;
  const todayYmd = jakartaYmd(now);
  const horizon = new Date(now.getTime() + horizonDays * 86_400_000);

  const templateRows = (await db
    .select({
      template: transactionTemplates,
      walletName: wallets.name,
      walletIcon: wallets.icon,
      categoryName: categories.name,
    })
    .from(transactionTemplates)
    .leftJoin(wallets, eq(wallets.id, transactionTemplates.walletId))
    .leftJoin(categories, eq(categories.id, transactionTemplates.categoryId))
    .where(
      and(
        eq(transactionTemplates.userId, userId),
        ne(transactionTemplates.frequency, 'none'),
        isNotNull(transactionTemplates.nextRunAt),
        lte(transactionTemplates.nextRunAt, horizon),
      ),
    )
    .orderBy(asc(transactionTemplates.nextRunAt))
    .limit(20)) as TemplateUpcomingRow[];

  const items: UpcomingItem[] = templateRows.map((row) => {
    const date = row.template.nextRunAt!;
    const ymd = jakartaYmd(date);
    const daysUntil = dayDiff(todayYmd, ymd);
    return {
      id: `template:${row.template.id}`,
      kind: 'template',
      title: row.template.name,
      subtitle: [row.walletName, row.categoryName].filter(Boolean).join(' · ') || 'Template transaksi',
      amount: Number(row.template.amount),
      date,
      ymd,
      daysUntil,
      overdue: daysUntil < 0,
      href: '/templates',
      icon: row.template.kind === 'income' ? '↘' : '↗',
    };
  });

  const debts = await listDebts(db, userId);
  for (const debt of debts) {
    if (debt.status !== 'open' || !debt.dueAt || debt.dueAt > horizon) continue;
    const ymd = jakartaYmd(debt.dueAt);
    const daysUntil = dayDiff(todayYmd, ymd);
    items.push({
      id: `debt:${debt.id}`,
      kind: 'debt',
      title:
        debt.direction === 'payable'
          ? `Bayar ${debt.counterparty}`
          : `Tagih ${debt.counterparty}`,
      subtitle:
        debt.direction === 'payable'
          ? `Sisa hutang · ${debt.paymentWallet.name}`
          : `Sisa piutang · ${debt.paymentWallet.name}`,
      amount: debt.remaining,
      date: debt.dueAt,
      ymd,
      daysUntil,
      overdue: daysUntil < 0,
      href: `/debts/${debt.id}`,
      icon: debt.direction === 'payable' ? '💳' : '🤝',
      direction: debt.direction,
    });
  }

  const creditWallets = (await listWallets(db, userId)).filter(
    (wallet) => wallet.type === 'credit' && wallet.dueDay && wallet.balance < 0,
  );
  for (const wallet of creditWallets) {
    const ymd = nextDueYmd(wallet.dueDay!, todayYmd);
    const daysUntil = dayDiff(todayYmd, ymd);
    if (daysUntil > horizonDays) continue;
    items.push({
      id: `credit:${wallet.id}`,
      kind: 'credit',
      title: `Bayar ${wallet.name}`,
      subtitle: `Tagihan kartu kredit${
        wallet.creditLimit ? ` · limit ${formatIdr(wallet.creditLimit)}` : ''
      }`,
      amount: Math.max(-wallet.balance, 0),
      date: jakartaDateAtNoonUtc(ymd),
      ymd,
      daysUntil,
      overdue: daysUntil < 0,
      href: `/wallets/${wallet.id}`,
      icon: '💳',
    });
  }

  return items.sort((a, b) => a.date.getTime() - b.date.getTime());
}
