import Link from 'next/link';
import { Download, LogOut } from 'lucide-react';
import { BudgetManager } from '@/components/app/budget-manager';
import { CategoryManager } from '@/components/app/category-manager';
import { DeleteAccountCard } from '@/components/app/delete-account-card';
import { ThemeSelector } from '@/components/app/theme-toggle';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { cn } from '@/lib/utils';
import { signOutAction } from '@/server/actions/auth';
import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db/client';
import { listBudgets } from '@/server/services/budgets';
import { listCategories } from '@/server/services/categories';

export const metadata = { title: 'Pengaturan' };

export default async function SettingsPage() {
  const user = await requireUser();
  const db = await getDb();
  const [categories, budgets] = await Promise.all([
    listCategories(db, user.id, { includeArchived: true }),
    listBudgets(db, user.id),
  ]);
  const supabaseMode = isSupabaseConfigured();
  const budgetByCategory = new Map(budgets.map((budget) => [budget.categoryId, budget]));
  const budgetTargets = categories
    .filter((category) => category.kind === 'expense' && !category.archivedAt)
    .map((category) => {
      const budget = budgetByCategory.get(category.id);
      return {
        categoryId: category.id,
        name: category.name,
        icon: category.icon,
        amount: budget?.amount ?? null,
        enabled: budget?.enabled ?? false,
      };
    });

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-semibold">Pengaturan</h1>

      <Card>
        <CardHeader>
          <CardTitle>Tampilan</CardTitle>
        </CardHeader>
        <CardContent>
          <ThemeSelector />
        </CardContent>
      </Card>

      <Card id="kategori" className="scroll-mt-20">
        <CardHeader>
          <CardTitle>Kategori</CardTitle>
        </CardHeader>
        <CardContent>
          <CategoryManager
            categories={categories.map((category) => ({
              id: category.id,
              name: category.name,
              kind: category.kind,
              icon: category.icon,
              color: category.color,
              archived: Boolean(category.archivedAt),
            }))}
          />
        </CardContent>
      </Card>

      <Card id="budget" className="scroll-mt-20">
        <CardHeader>
          <CardTitle>Budget bulanan</CardTitle>
        </CardHeader>
        <CardContent>
          <BudgetManager budgets={budgetTargets} />
        </CardContent>
      </Card>

      <Card id="kantong" className="scroll-mt-20">
        <CardHeader>
          <CardTitle>Kantong</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Kelola kantong: tambah, ubah, arsipkan, dan rekonsiliasi saldo.
          </p>
          <Link href="/wallets" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'shrink-0')}>
            Buka kantong
          </Link>
        </CardContent>
      </Card>

      <Card id="item" className="scroll-mt-20">
        <CardHeader>
          <CardTitle>Item &amp; harga</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Katalog barang yang pernah kamu beli beserta riwayat harganya.
          </p>
          <Link href="/items" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'shrink-0')}>
            Buka item
          </Link>
        </CardContent>
      </Card>

      <Card id="pinjaman" className="scroll-mt-20">
        <CardHeader>
          <CardTitle>Hutang &amp; piutang</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Catat pinjaman: dari/ke siapa, untuk apa, kantong sumber dana, dan kantong
            pembayarannya.
          </p>
          <Link href="/debts" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'shrink-0')}>
            Buka
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <a href="/api/export" download className={cn(buttonVariants({ variant: 'outline' }), 'w-full sm:w-auto')}>
            <Download /> Ekspor semua transaksi (CSV)
          </a>
          <p className="text-xs text-muted-foreground">
            CSV berisi tanggal, tipe, kantong, kategori, nominal, dan catatan — siap dibuka
            di Excel/Google Sheets.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Akun</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">Masuk sebagai</span>
            <span className="truncate font-medium">{user.email ?? 'Mode lokal'}</span>
          </div>
          {supabaseMode ? (
            <form action={signOutAction}>
              <button type="submit" className={cn(buttonVariants({ variant: 'outline' }), 'gap-2')}>
                <LogOut /> Keluar
              </button>
            </form>
          ) : (
            <p className="text-xs text-muted-foreground">
              Aplikasi berjalan dalam mode lokal satu pengguna (data tersimpan di perangkat
              server ini). Isi env Supabase untuk mengaktifkan login multi-user.
            </p>
          )}
          <DeleteAccountCard supabaseMode={supabaseMode} />
        </CardContent>
      </Card>

      <p className="pb-2 text-center text-xs text-muted-foreground">
        Money Tracker v0.1 · Semua laporan memakai zona waktu Asia/Jakarta (WIB)
      </p>
    </div>
  );
}
