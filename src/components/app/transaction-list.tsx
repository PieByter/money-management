'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { animate, motion, useMotionValue } from 'framer-motion';
import { Inbox, Loader2, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { dayLabel, timeLabel } from '@/lib/dates';
import { formatIdr } from '@/lib/money';
import { groupByDay, toDisplayTransactions, type DisplayTransaction } from '@/lib/transactions-view';
import { cn } from '@/lib/utils';
import type { TransactionListItem } from '@/server/services/transactions';
import { deleteTransactionAction, listTransactionsAction, restoreTransactionsAction } from '@/server/actions/transactions';
import { AmountText } from './amount-text';
import { useTransactionSheet } from './transaction-sheet-provider';

export interface ListFilterValues {
  month?: string | null;
  walletId?: string | null;
  categoryId?: string | null;
  kind?: 'income' | 'expense' | 'transfer' | 'adjustment' | null;
  tag?: string | null;
  search?: string | null;
}

function iconFor(item: DisplayTransaction): string {
  if (item.icon) return item.icon;
  if (item.kind === 'income') return '💰';
  if (item.kind === 'expense') return '💸';
  if (item.kind === 'transfer') return '🔁';
  return '⚖️';
}

function subtitleFor(item: DisplayTransaction): string {
  const parts: string[] = [];
  if (item.kind !== 'transfer') parts.push(item.walletName);
  parts.push(timeLabel(item.occurredAt));
  if (item.note) parts.push(item.note);
  return parts.join(' · ');
}

export function TransactionRow({
  item,
  onClick,
  onDelete,
}: {
  item: DisplayTransaction;
  onClick?: () => void;
  onDelete?: () => void;
}) {
  const content = (
    <>
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-lg"
        style={item.color ? { backgroundColor: `${item.color}26` } : undefined}
        aria-hidden
      >
        {iconFor(item)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{item.title}</span>
        <span className="block truncate text-xs text-muted-foreground">{subtitleFor(item)}</span>
      </span>
      <AmountText kind={item.kind} amount={item.amount} />
    </>
  );

  if (onDelete) {
    return (
      <div className="group flex w-full items-center gap-1 pr-2">
        {onClick ? (
          <button
            type="button"
            onClick={onClick}
            className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60"
          >
            {content}
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3">{content}</div>
        )}
        <button
          type="button"
          onPointerDownCapture={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          aria-label={`Hapus ${item.title}`}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    );
  }

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60"
      >
        {content}
      </button>
    );
  }

  return <div className="flex w-full items-center gap-3 px-4 py-3">{content}</div>;
}

export function EmptyState({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border px-6 py-10 text-center">
      <Inbox className="h-7 w-7 text-muted-foreground" />
      <p className="text-sm font-medium">{title}</p>
      {hint ? <p className="max-w-xs text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

const ACTION_WIDTH = 144;

/** Baris dengan gestur swipe: kiri → tombol Ubah/Hapus (mobile-first). */
function SwipeRow({
  onEdit,
  onDelete,
  children,
}: {
  onEdit: () => void;
  onDelete: () => void;
  children: React.ReactNode;
}) {
  const x = useMotionValue(0);
  const [revealed, setRevealed] = useState(false);

  const snap = useCallback(
    (open: boolean) => {
      setRevealed(open);
      void animate(x, open ? -ACTION_WIDTH : 0, { type: 'spring', stiffness: 420, damping: 40 });
    },
    [x],
  );

  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-y-0 right-0 flex w-36" aria-hidden={!revealed}>
        <button
          type="button"
          tabIndex={revealed ? 0 : -1}
          onClick={() => {
            snap(false);
            onEdit();
          }}
          className="flex flex-1 flex-col items-center justify-center gap-0.5 bg-sky-600 text-[11px] font-medium text-white"
        >
          <Pencil className="h-4 w-4" />
          Ubah
        </button>
        <button
          type="button"
          tabIndex={revealed ? 0 : -1}
          onClick={() => {
            snap(false);
            onDelete();
          }}
          className="flex flex-1 flex-col items-center justify-center gap-0.5 bg-destructive text-[11px] font-medium text-destructive-foreground"
        >
          <Trash2 className="h-4 w-4" />
          Hapus
        </button>
      </div>
      <motion.div
        drag="x"
        style={{ x }}
        dragConstraints={{ left: -ACTION_WIDTH, right: 0 }}
        dragElastic={0.05}
        dragDirectionLock
        onDragEnd={(_, info) => {
          const shouldOpen = info.offset.x < -ACTION_WIDTH / 2 || info.velocity.x < -450;
          snap(shouldOpen);
        }}
        onTap={() => {
          if (revealed) snap(false);
          else onEdit();
        }}
        className="relative touch-pan-y bg-card"
      >
        {children}
      </motion.div>
    </div>
  );
}

export function TransactionList({
  initialItems,
  initialCursor,
  filter,
  emptyTitle = 'Belum ada transaksi',
  emptyHint,
  pageSize = 50,
}: {
  initialItems: TransactionListItem[];
  initialCursor: string | null;
  filter: ListFilterValues;
  emptyTitle?: string;
  emptyHint?: string;
  pageSize?: number;
}) {
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const { openEdit } = useTransactionSheet();

  useEffect(() => {
    setItems(initialItems);
    setCursor(initialCursor);
    setHiddenIds(new Set());
  }, [initialItems, initialCursor]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    const result = await listTransactionsAction({ ...filter, cursor, limit: pageSize });
    setLoadingMore(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setItems((prev) => [...prev, ...result.data.items]);
    setCursor(result.data.nextCursor);
  }, [cursor, filter, loadingMore, pageSize]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !cursor) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: '480px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [cursor, loadMore]);

  const handleDelete = useCallback(
    async (item: DisplayTransaction) => {
      const result = await deleteTransactionAction(item.primaryId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const removedIds = result.data.ids;
      setHiddenIds((prev) => new Set([...prev, ...removedIds]));
      toast.success(
        item.kind === 'transfer' ? 'Transfer dihapus' : 'Transaksi dihapus',
        {
          duration: 6000,
          action: {
            label: 'Urungkan',
            onClick: () => {
              void (async () => {
                const restored = await restoreTransactionsAction(removedIds);
                if (!restored.ok) {
                  toast.error(restored.error);
                  return;
                }
                setHiddenIds((prev) => {
                  const next = new Set(prev);
                  for (const id of removedIds) next.delete(id);
                  return next;
                });
                toast.success('Transaksi dikembalikan');
              })();
            },
          },
        },
      );
    },
    [],
  );

  const visible = useMemo(
    () => toDisplayTransactions(items.filter((item) => !hiddenIds.has(item.id))),
    [hiddenIds, items],
  );
  const groups = useMemo(() => groupByDay(visible), [visible]);

  if (visible.length === 0) {
    return <EmptyState title={emptyTitle} hint={emptyHint} />;
  }

  return (
    <div>
      {groups.map((group) => (
        <section key={group.ymd}>
          <header className="flex items-baseline justify-between px-1 pb-1.5 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {dayLabel(group.ymd)}
            </h3>
            <p className="text-xs tabular-nums text-muted-foreground">
              {[
                group.expense > 0 ? `−${formatIdr(group.expense)}` : null,
                group.income > 0 ? `+${formatIdr(group.income)}` : null,
              ]
                .filter(Boolean)
                .join('  ·  ')}
            </p>
          </header>
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {group.items.map((item) => (
              <SwipeRow
                key={item.key}
                onEdit={() => openEdit(item.primaryId)}
                onDelete={() => void handleDelete(item)}
              >
                <TransactionRow item={item} onDelete={() => void handleDelete(item)} />
              </SwipeRow>
            ))}
          </div>
        </section>
      ))}

      {cursor ? (
        <div ref={sentinelRef} className="flex justify-center py-5">
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className={cn(
              'flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted',
              loadingMore && 'opacity-70',
            )}
          >
            {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loadingMore ? 'Memuat…' : 'Muat lebih banyak'}
          </button>
        </div>
      ) : (
        <p className="py-4 text-center text-xs text-muted-foreground">Semua transaksi sudah dimuat</p>
      )}
    </div>
  );
}

/** Daftar ringkas tanpa paginasi (dashboard & detail kantong). */
export function StaticTransactionList({
  items,
  emptyTitle = 'Belum ada transaksi',
  emptyHint,
  compact = false,
}: {
  items: TransactionListItem[];
  emptyTitle?: string;
  emptyHint?: string;
  compact?: boolean;
}) {
  const { openEdit } = useTransactionSheet();
  const display = useMemo(() => toDisplayTransactions(items), [items]);

  if (display.length === 0) return <EmptyState title={emptyTitle} hint={emptyHint} />;

  return (
    <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
      {display.map((item) => (
        <TransactionRow
          key={item.key}
          item={item}
          onClick={compact ? undefined : () => openEdit(item.primaryId)}
        />
      ))}
    </div>
  );
}
