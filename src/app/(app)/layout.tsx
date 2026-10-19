import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db/client';
import { listCategories } from '@/server/services/categories';
import { ensureDefaults } from '@/server/services/defaults';
import { getFrequentCategories, getLastUsedWalletId } from '@/server/services/reports';
import { getFrequentItems } from '@/server/services/items';
import { listWallets } from '@/server/services/wallets';
import { AppShell } from '@/components/app/app-shell';
import { TransactionSheetProvider } from '@/components/app/transaction-sheet-provider';
import type { CategoryOption, SheetData } from '@/lib/view-types';

// Data keuangan selalu personal & real-time: jangan pernah di-prerender statis.
export const dynamic = 'force-dynamic';

function orderByFrequency(list: CategoryOption[], frequentIds: string[]): CategoryOption[] {
  const rank = new Map(frequentIds.map((id, index) => [id, index]));
  return [...list].sort((a, b) => {
    const rankA = rank.get(a.id);
    const rankB = rank.get(b.id);
    if (rankA !== undefined && rankB !== undefined) return rankA - rankB;
    if (rankA !== undefined) return -1;
    if (rankB !== undefined) return 1;
    return 0;
  });
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const db = await getDb();
  await ensureDefaults(db, user.id);

  const [wallets, categories, frequentExpense, frequentIncome, lastUsedWalletId, frequentItems] =
    await Promise.all([
      listWallets(db, user.id),
      listCategories(db, user.id),
      getFrequentCategories(db, user.id, 'expense', 6),
      getFrequentCategories(db, user.id, 'income', 4),
      getLastUsedWalletId(db, user.id),
      getFrequentItems(db, user.id, 10),
    ]);

  const toOption = (category: (typeof categories)[number]): CategoryOption => ({
    id: category.id,
    name: category.name,
    icon: category.icon,
    color: category.color,
  });

  const sheetData: SheetData = {
    wallets: wallets.map((wallet) => ({
      id: wallet.id,
      name: wallet.name,
      icon: wallet.icon,
      color: wallet.color,
      type: wallet.type,
    })),
    expenseCategories: orderByFrequency(
      categories.filter((c) => c.kind === 'expense').map(toOption),
      frequentExpense.map((c) => c.id),
    ),
    incomeCategories: orderByFrequency(
      categories.filter((c) => c.kind === 'income').map(toOption),
      frequentIncome.map((c) => c.id),
    ),
    lastUsedWalletId,
    frequentItems: frequentItems.map((item) => ({
      id: item.id,
      name: item.name,
      lastPrice: item.lastPrice,
    })),
  };

  return (
    <TransactionSheetProvider data={sheetData}>
      <AppShell userEmail={user.email}>{children}</AppShell>
    </TransactionSheetProvider>
  );
}
