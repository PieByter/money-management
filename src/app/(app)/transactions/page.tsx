import { FilterBar } from '@/components/app/filter-bar';
import { TransactionList } from '@/components/app/transaction-list';
import { monthKeySchema, uuidSchema } from '@/lib/schemas';
import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db/client';
import { listCategories } from '@/server/services/categories';
import { listTransactions } from '@/server/services/transactions';
import { listWallets } from '@/server/services/wallets';

export const metadata = { title: 'Riwayat' };

const KINDS = ['income', 'expense', 'transfer', 'adjustment'] as const;
type Kind = (typeof KINDS)[number];

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const single = (value: string | string[] | undefined) =>
    typeof value === 'string' ? value : undefined;

  const monthParsed = monthKeySchema.safeParse(single(params.m));
  const kindParam = single(params.jenis);
  const walletParsed = uuidSchema.safeParse(single(params.kantong));
  const categoryParsed = uuidSchema.safeParse(single(params.kategori));
  const searchParam = single(params.q)?.trim();

  const filter = {
    month: monthParsed.success ? monthParsed.data : null,
    kind: KINDS.includes(kindParam as Kind) ? (kindParam as Kind) : null,
    walletId: walletParsed.success ? walletParsed.data : null,
    categoryId: categoryParsed.success ? categoryParsed.data : null,
    search: searchParam ? searchParam : null,
  };

  const user = await requireUser();
  const db = await getDb();

  const [page, wallets, categories] = await Promise.all([
    listTransactions(db, user.id, {
      filter: {
        month: filter.month ?? undefined,
        kind: filter.kind ?? undefined,
        walletId: filter.walletId ?? undefined,
        categoryId: filter.categoryId ?? undefined,
        search: filter.search ?? undefined,
      },
      limit: 50,
    }),
    listWallets(db, user.id, { includeArchived: true }),
    listCategories(db, user.id, { includeArchived: false }),
  ]);

  return (
    <div>
      <h1 className="mb-3 text-lg font-semibold">Riwayat</h1>
      <FilterBar
        wallets={wallets.map((wallet) => ({ id: wallet.id, name: wallet.name, icon: wallet.icon }))}
        categories={categories.map((category) => ({
          id: category.id,
          name: category.name,
          kind: category.kind,
        }))}
      />
      <div className="mt-1">
        <TransactionList
          initialItems={page.items}
          initialCursor={page.nextCursor}
          filter={filter}
          emptyTitle="Tidak ada transaksi"
          emptyHint="Coba ubah filter, atau catat transaksi baru lewat tombol +."
        />
      </div>
    </div>
  );
}
