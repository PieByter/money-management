import Link from 'next/link';
import {
  WalletActionsMenu,
  WalletBulkCreateButton,
  WalletCreateButton,
} from '@/components/app/wallet-manager';
import { formatIdr } from '@/lib/money';
import { WALLET_TYPE_LABELS } from '@/lib/view-types';
import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db/client';
import { listWallets, type WalletWithBalance } from '@/server/services/wallets';

export const metadata = { title: 'Kantong' };

function toTarget(wallet: WalletWithBalance) {
  return {
    id: wallet.id,
    name: wallet.name,
    type: wallet.type,
    icon: wallet.icon,
    color: wallet.color,
    balance: wallet.balance,
    archived: Boolean(wallet.archivedAt),
  };
}

export default async function WalletsPage() {
  const user = await requireUser();
  const db = await getDb();
  const wallets = await listWallets(db, user.id, { includeArchived: true });

  const active = wallets.filter((wallet) => !wallet.archivedAt);
  const archived = wallets.filter((wallet) => wallet.archivedAt);
  const total = active.reduce((sum, wallet) => sum + wallet.balance, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Kantong</h1>
        <WalletCreateButton label="Tambah kantong" />
      </div>

      <div className="rounded-2xl border border-border bg-card px-4 py-3.5">
        <p className="text-xs text-muted-foreground">Total aset</p>
        <p className="text-2xl font-semibold tabular-nums">{formatIdr(total)}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Dari {active.length} kantong aktif
        </p>
      </div>

      {active.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-dashed border-border px-6 py-10 text-center">
          <span className="text-3xl" aria-hidden>
            👛
          </span>
          <p className="text-sm font-medium">Belum ada kantong</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            Tambahkan sekaligus kantong yang umum dipakai (Cash, OVO, GoPay, ShopeePay, Bank
            Mandiri, Bank Permata, Bank Jago, Kartu e-Money) — nanti bisa diubah/dihapus.
          </p>
          <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
            <WalletBulkCreateButton label="Tambah 8 kantong rekomendasi" variant="default" />
            <WalletCreateButton label="Buat manual" />
          </div>
        </div>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {active.map((wallet) => (
            <div key={wallet.id} className="flex items-center gap-1 px-3 py-2.5">
              <Link
                href={`/wallets/${wallet.id}`}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-xl py-1 transition-colors hover:bg-muted/60"
              >
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-lg"
                  style={wallet.color ? { backgroundColor: `${wallet.color}26` } : undefined}
                  aria-hidden
                >
                  {wallet.icon ?? '💳'}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{wallet.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {WALLET_TYPE_LABELS[wallet.type] ?? wallet.type}
                  </span>
                </span>
              </Link>
              <span className="shrink-0 text-sm font-semibold tabular-nums">
                {formatIdr(wallet.balance)}
              </span>
              <WalletActionsMenu wallet={toTarget(wallet)} />
            </div>
          ))}
        </div>
      )}

      {archived.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Diarsipkan</h2>
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card opacity-80">
            {archived.map((wallet) => (
              <div key={wallet.id} className="flex items-center gap-1 px-3 py-2.5">
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-lg"
                  aria-hidden
                >
                  {wallet.icon ?? '💳'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{wallet.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {WALLET_TYPE_LABELS[wallet.type] ?? wallet.type}
                  </span>
                </span>
                <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                  {formatIdr(wallet.balance)}
                </span>
                <WalletActionsMenu wallet={toTarget(wallet)} />
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
