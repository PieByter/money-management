'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, Home, Plus, ReceiptText, Settings, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThemeToggle } from './theme-toggle';
import { useTransactionSheet } from './transaction-sheet-provider';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Home', icon: Home },
  { href: '/transactions', label: 'Riwayat', icon: ReceiptText },
  { href: '/wallets', label: 'Kantong', icon: Wallet },
  { href: '/reports', label: 'Laporan', icon: BarChart3 },
] as const;

export function AppShell({
  userEmail,
  children,
}: {
  userEmail: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { openCreate } = useTransactionSheet();

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="min-h-dvh">
      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-card px-4 py-6 lg:flex">
        <Link href="/dashboard" className="flex items-center gap-2 px-2 text-lg font-semibold">
          <span aria-hidden>💰</span> Money Tracker
        </Link>
        <nav className="mt-6 flex flex-col gap-1" aria-label="Navigasi utama">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                  active
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <button
          type="button"
          onClick={() => openCreate('expense')}
          className="mt-5 flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Catat transaksi
        </button>
        <div className="mt-auto space-y-2 border-t border-border pt-4">
          <div className="flex items-center justify-between">
            <span className="truncate px-1 text-xs text-muted-foreground" title={userEmail ?? 'Mode lokal'}>
              {userEmail ?? 'Mode lokal'}
            </span>
            <ThemeToggle />
          </div>
          <Link
            href="/settings"
            className={cn(
              'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
              isActive('/settings')
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Settings className="h-5 w-5" />
            Pengaturan
          </Link>
        </div>
      </aside>

      <div className="flex min-h-dvh flex-col lg:pl-64">
        {/* Header mobile */}
        <header className="safe-top sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/90 px-4 py-2.5 backdrop-blur lg:hidden">
          <Link href="/dashboard" className="flex items-center gap-1.5 text-base font-semibold">
            <span aria-hidden>💰</span> Money Tracker
          </Link>
          <div className="flex items-center gap-0.5">
            <ThemeToggle />
            <Link
              href="/settings"
              className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Pengaturan"
            >
              <Settings className="h-5 w-5" />
            </Link>
          </div>
        </header>

        <main className="mx-auto w-full max-w-md flex-1 px-4 pb-28 pt-4 lg:max-w-4xl lg:px-8 lg:pb-16 lg:pt-8">
          {children}
        </main>

        {/* Bottom tab bar mobile */}
        <nav
          className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur lg:hidden"
          aria-label="Navigasi utama"
        >
          <div className="mx-auto grid max-w-md grid-cols-5 items-center px-1 pt-1.5">
            <TabItem href="/dashboard" label="Home" icon={Home} active={isActive('/dashboard')} />
            <TabItem
              href="/transactions"
              label="Riwayat"
              icon={ReceiptText}
              active={isActive('/transactions')}
            />
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => openCreate('expense')}
                aria-label="Tambah transaksi"
                className="-mt-7 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform active:scale-95"
              >
                <Plus className="h-7 w-7" />
              </button>
            </div>
            <TabItem href="/wallets" label="Kantong" icon={Wallet} active={isActive('/wallets')} />
            <TabItem href="/reports" label="Laporan" icon={BarChart3} active={isActive('/reports')} />
          </div>
        </nav>
      </div>
    </div>
  );
}

function TabItem({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'flex flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[11px] font-medium transition-colors',
        active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
      )}
      aria-current={active ? 'page' : undefined}
    >
      <Icon className="h-5 w-5" />
      {label}
    </Link>
  );
}
