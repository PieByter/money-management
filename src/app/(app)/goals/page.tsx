import { GoalManager, type GoalTarget } from '@/components/app/goal-manager';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatIdr } from '@/lib/money';
import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db/client';
import { listGoals } from '@/server/services/goals';
import { listWallets } from '@/server/services/wallets';

export const metadata = { title: 'Tujuan' };

export default async function GoalsPage() {
  const user = await requireUser();
  const db = await getDb();
  const [goals, wallets] = await Promise.all([
    listGoals(db, user.id, { includeArchived: true }),
    listWallets(db, user.id),
  ]);

  const walletOptions = wallets
    .filter((wallet) => wallet.type !== 'credit' && !wallet.archivedAt)
    .map((wallet) => ({ id: wallet.id, name: wallet.name, icon: wallet.icon }));

  const targets: GoalTarget[] = goals.map((goal) => ({
    id: goal.id,
    name: goal.name,
    targetAmount: goal.targetAmount,
    saved: goal.saved,
    remaining: goal.remaining,
    ratio: goal.ratio,
    walletId: goal.wallet.id,
    walletName: goal.wallet.name,
    walletIcon: goal.wallet.icon,
    targetYmd: goal.targetYmd,
    daysLeft: goal.daysLeft,
    monthlyNeeded: goal.monthlyNeeded,
    note: goal.note,
    archived: Boolean(goal.archivedAt),
  }));

  const active = targets.filter((goal) => !goal.archived);
  const totalSaved = active.reduce((sum, goal) => sum + Math.max(goal.saved, 0), 0);
  const totalTarget = active.reduce((sum, goal) => sum + goal.targetAmount, 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold">Tujuan tabungan</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Kumpulkan dana untuk hal tertentu dengan kantong khusus. Progres mengikuti saldo kantong,
          bukan angka yang diketik manual.
        </p>
      </div>

      {active.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Ringkasan tujuan aktif</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-2xl font-semibold tabular-nums">{formatIdr(totalSaved)}</p>
              <p className="text-xs text-muted-foreground">dari {formatIdr(totalTarget)}</p>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{
                  width: `${Math.min(
                    totalTarget > 0 ? Math.round((totalSaved / totalTarget) * 100) : 0,
                    100,
                  )}%`,
                }}
              />
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {active.length} tujuan aktif · sisa {formatIdr(Math.max(totalTarget - totalSaved, 0))}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <GoalManager goals={targets} wallets={walletOptions} />
    </div>
  );
}
