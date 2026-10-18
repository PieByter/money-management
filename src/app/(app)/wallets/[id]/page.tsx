import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { ReconcileDialog } from '@/components/app/reconcile-dialog';
import { TransactionList } from '@/components/app/transaction-list';
import { WalletActionsMenu } from '@/components/app/wallet-manager';
import { formatIdr } from '@/lib/money';
import { uuidSchema } from '@/lib/schemas';
import { WALLET_TYPE_LABELS } from '@/lib/view-types';
import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db/client';
import { listTransactions } from '@/server/services/transactions';
import { getWallet } from '@/server/services/wallets';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) return { title: 'Kantong' };
  const user = await requireUser();
  const db = await getDb();
  const wallet = await getWallet(db, user.id, parsed.data);
  return { title: wallet ? wallet.name : 'Kantong' };
}

export default async function WalletDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) notFound();

  const user = await requireUser();
  const db = await getDb();
  const wallet = await getWallet(db, user.id, parsed.data);
  if (!wallet) notFound();

  const page = await listTransactions(db, user.id, {
    filter: { walletId: wallet.id },
    limit: 50,
  });

  const target = {
    id: wallet.id,
    name: wallet.name,
    type: wallet.type,
    icon: wallet.icon,
    color: wallet.color,
    balance: wallet.balance,
    archived: Boolean(wallet.archivedAt),
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link
          href="/wallets"
          aria-label="Kembali ke daftar kantong"
          className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{wallet.name}</h1>
        <WalletActionsMenu wallet={target} />
      </div>

      {wallet.archivedAt ? (
        <p className="rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
          Kantong ini diarsipkan. Transaksi baru tidak bisa dicatat ke kantong ini.
        </p>
      ) : null}

      <div className="rounded-2xl border border-border bg-card px-4 py-4">
        <div className="flex items-center gap-3">
          <span
            className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-2xl"
            style={wallet.color ? { backgroundColor: `${wallet.color}26` } : undefined}
            aria-hidden
          >
            {wallet.icon ?? '💳'}
          </span>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">
              {WALLET_TYPE_LABELS[wallet.type] ?? wallet.type}
            </p>
            <p className="text-2xl font-semibold tabular-nums">{formatIdr(wallet.balance)}</p>
          </div>
          <div className="ml-auto">
            <ReconcileDialog
              walletId={wallet.id}
              walletName={wallet.name}
              currentBalance={wallet.balance}
            />
          </div>
        </div>
      </div>

      <section>
        <h2 className="mb-1 px-1 text-sm font-semibold">Mutasi kantong</h2>
        <TransactionList
          initialItems={page.items}
          initialCursor={page.nextCursor}
          filter={{ walletId: wallet.id }}
          emptyTitle="Belum ada mutasi"
          emptyHint="Semua transaksi kantong ini akan tampil di sini."
        />
      </section>
    </div>
  );
}
