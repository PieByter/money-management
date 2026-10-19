'use client';

import { useState } from 'react';
import { ChevronDown, Plus, Receipt, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { formatAmount, formatIdr, parseAmountInput } from '@/lib/money';
import { cn } from '@/lib/utils';
import type { ItemChip } from '@/lib/view-types';

/** Satu baris rincian yang sedang diedit di sheet. */
export interface ItemLineDraft {
  key: string;
  itemId: string | null;
  name: string;
  amount: number;
  qtyMilli: number;
}

export function linesTotal(lines: ItemLineDraft[]): number {
  return lines.reduce((sum, line) => sum + line.amount, 0);
}

let keyCounter = 0;
function newKey(): string {
  keyCounter += 1;
  return `line-${keyCounter}-${Math.random().toString(36).slice(2, 7)}`;
}

export function makeItemLine(input: {
  itemId?: string | null;
  name?: string;
  amount?: number;
  qtyMilli?: number;
}): ItemLineDraft {
  return {
    key: newKey(),
    itemId: input.itemId ?? null,
    name: input.name ?? '',
    amount: input.amount ?? 0,
    qtyMilli: input.qtyMilli ?? 1000,
  };
}

/** "1" · "1,5" · "2" — jumlah dengan desimal seperlunya. */
export function formatQty(qtyMilli: number): string {
  const whole = Math.trunc(qtyMilli / 1000);
  const fraction = qtyMilli % 1000;
  if (fraction === 0) return String(whole);
  return `${whole},${String(fraction).padStart(3, '0').replace(/0+$/, '')}`;
}

/** "1,5" atau "2" → 1500 / 2000 (×1000, tanpa float). */
export function parseQtyInput(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, '').replace(',', '.');
  if (!cleaned) return null;
  if (!/^\d+(\.\d{0,3})?$/.test(cleaned)) return null;
  const [whole, fraction = ''] = cleaned.split('.');
  const value = Number(whole) * 1000 + Number(fraction.padEnd(3, '0'));
  return value > 0 ? value : null;
}

/**
 * Rincian item gaya belanja: begitu daftar harga per barang diisi, total bisa
 * disamakan dengan rincian. Selisih yang belum dirinci ditampilkan apa adanya.
 */
export function ItemLines({
  lines,
  setLines,
  suggestions,
  total,
  onUseLinesTotal,
  disabled,
}: {
  lines: ItemLineDraft[];
  setLines: (updater: (prev: ItemLineDraft[]) => ItemLineDraft[]) => void;
  suggestions: ItemChip[];
  total: number;
  onUseLinesTotal: () => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftPrice, setDraftPrice] = useState('');

  const sum = linesTotal(lines);
  const remaining = total - sum;
  const exceeded = sum > total;

  function update(key: string, patch: Partial<ItemLineDraft>) {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function addLine(input: { itemId?: string | null; name: string; amount?: number }) {
    const name = input.name.trim();
    if (!name) return;
    setLines((prev) => [
      ...prev,
      makeItemLine({ itemId: input.itemId ?? null, name, amount: input.amount ?? 0 }),
    ]);
  }

  function addFromDraft() {
    const price = parseAmountInput(draftPrice);
    if (!draftName.trim()) return;
    addLine({ name: draftName, amount: price ?? 0 });
    setDraftName('');
    setDraftPrice('');
  }

  const usedIds = new Set(lines.map((line) => line.itemId).filter(Boolean) as string[]);

  return (
    <section className="mt-2 rounded-2xl border border-border bg-card/60 p-3 sm:col-span-2">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <Receipt className="h-4 w-4 text-muted-foreground" />
          Rincian item
          {lines.length > 0 ? (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">
              {lines.length}
            </span>
          ) : null}
        </span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {lines.length > 0 ? (
            <span className={cn('tabular-nums', exceeded && 'font-medium text-expense')}>
              {formatIdr(sum)}
              {exceeded ? ' > total' : remaining > 0 ? ` · sisa ${formatIdr(remaining)}` : ' · pas'}
            </span>
          ) : (
            'opsional'
          )}
          <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
        </span>
      </button>

      {open ? (
        <div className="mt-3 space-y-3">
          {suggestions.length > 0 ? (
            <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1">
              {suggestions.map((item) => {                const used = usedIds.has(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={disabled || used}
                    onClick={() =>
                      addLine({ itemId: item.id, name: item.name, amount: item.lastPrice ?? 0 })
                    }
                    className={cn(
                      'flex shrink-0 flex-col items-start rounded-xl border px-2.5 py-1.5 text-left transition-colors',
                      used
                        ? 'border-border bg-muted text-muted-foreground'
                        : 'border-border bg-card hover:bg-muted',
                    )}
                  >
                    <span className="text-xs font-medium">{item.name}</span>
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      {item.lastPrice ? formatIdr(item.lastPrice) : 'harga baru'}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {lines.length > 0 ? (
            <ul className="space-y-2">
              {lines.map((line) => (
                <li key={line.key} className="rounded-xl border border-border bg-card p-2">
                  <div className="flex items-center gap-2">
                    <Input
                      value={line.name}
                      onChange={(event) => update(line.key, { name: event.target.value })}
                      placeholder="Nama barang"
                      aria-label="Nama barang"
                      maxLength={60}
                      className="h-9 flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => setLines((prev) => prev.filter((entry) => entry.key !== line.key))}
                      disabled={disabled}
                      aria-label={`Hapus ${line.name || 'item'}`}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Input
                      inputMode="decimal"
                      value={formatQty(line.qtyMilli)}
                      onChange={(event) => {
                        const qty = parseQtyInput(event.target.value);
                        update(line.key, { qtyMilli: qty ?? line.qtyMilli });
                      }}
                      onBlur={(event) => {
                        const qty = parseQtyInput(event.target.value);
                        if (!qty) update(line.key, { qtyMilli: 1000 });
                      }}
                      aria-label={`Jumlah ${line.name || 'item'}`}
                      className="h-9 w-16 text-center tabular-nums"
                    />
                    <span className="text-xs text-muted-foreground">×</span>
                    <Input
                      inputMode="numeric"
                      value={line.amount ? formatAmount(line.amount) : ''}
                      onChange={(event) =>
                        update(line.key, { amount: parseAmountInput(event.target.value) ?? 0 })
                      }
                      placeholder="Harga"
                      aria-label={`Harga ${line.name || 'item'}`}
                      className="h-9 flex-1 text-right tabular-nums"
                    />
                    <span className="w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                      {line.qtyMilli > 1000 && line.amount > 0
                        ? `${formatIdr(Math.max(Math.round((line.amount * 1000) / line.qtyMilli), 1))}/satuan`
                        : ''}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">
              Tambahkan barang satu per satu kalau ingin tahu harga tiap item. Total belanja
              tetap yang dipakai di laporan.
            </p>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addFromDraft();
                }
              }}
              placeholder="Nama barang baru"
              aria-label="Nama barang baru"
              maxLength={60}
              className="h-9 sm:flex-1"
            />
            <Input
              inputMode="numeric"
              value={draftPrice}
              onChange={(event) => setDraftPrice(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addFromDraft();
                }
              }}
              placeholder="Harga"
              aria-label="Harga barang baru"
              className="h-9 sm:w-28 sm:text-right sm:tabular-nums"
            />
            <button
              type="button"
              onClick={addFromDraft}
              disabled={disabled || !draftName.trim()}
              className="flex h-9 items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 text-sm transition-colors hover:bg-muted disabled:opacity-40"
            >
              <Plus className="h-4 w-4" /> Tambah
            </button>
          </div>

          {lines.length > 0 ? (
            <div className="flex flex-col gap-2 border-t border-border pt-2 text-xs sm:flex-row sm:items-center sm:justify-between">
              <span className="text-muted-foreground">
                Total rincian <b className="tabular-nums">{formatIdr(sum)}</b> dari{' '}
                <b className="tabular-nums">{formatIdr(total)}</b>
              </span>
              {sum > 0 ? (
                <button
                  type="button"
                  onClick={onUseLinesTotal}
                  disabled={disabled}
                  className="self-start font-medium text-primary hover:underline sm:self-auto"
                >
                  Pakai total rincian ({formatIdr(sum)})
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
