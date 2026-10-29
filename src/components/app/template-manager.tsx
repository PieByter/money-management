'use client';

import { useState } from 'react';
import { CalendarClock, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { dayLabel } from '@/lib/dates';
import { formatAmount, formatIdr, parseAmountInput } from '@/lib/money';
import {
  FREQUENCY_OPTIONS,
  WEEKDAY_NAMES,
  scheduleLabel,
  type TemplateFrequency,
} from '@/lib/template-schedule';
import { cn } from '@/lib/utils';
import type {
  CategoryOption,
  ItemChip,
  TemplateSummary,
  WalletOption,
} from '@/lib/view-types';
import {
  applyTemplateAction,
  createTemplateAction,
  deleteTemplateAction,
  updateTemplateAction,
} from '@/server/actions/templates';
import { ItemLines, linesTotal, makeItemLine, type ItemLineDraft } from './item-lines';

export interface TemplateCategoryOption extends CategoryOption {
  kind: 'income' | 'expense';
}

interface TemplateManagerProps {
  templates: TemplateSummary[];
  wallets: WalletOption[];
  categories: TemplateCategoryOption[];
  frequentItems: ItemChip[];
}

export function TemplateManager({
  templates,
  wallets,
  categories,
  frequentItems,
}: TemplateManagerProps) {
  const [editing, setEditing] = useState<TemplateSummary | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setEditorOpen(true);
  }

  function openEdit(template: TemplateSummary) {
    setEditing(template);
    setEditorOpen(true);
  }

  async function apply(template: TemplateSummary) {
    setBusyId(template.id);
    const result = await applyTemplateAction(template.id);
    setBusyId(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      `${template.name} tercatat sebagai ${template.kind === 'income' ? 'pemasukan' : 'pengeluaran'}`,
    );
  }

  async function remove(template: TemplateSummary) {
    const confirmed = window.confirm(
      `Hapus template "${template.name}"? Transaksi yang sudah tercatat tidak ikut terhapus.`,
    );
    if (!confirmed) return;
    setBusyId(template.id);
    const result = await deleteTemplateAction(template.id);
    setBusyId(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success('Template dihapus');
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {templates.length > 0
            ? `${templates.length} template tersimpan`
            : 'Belum ada template tersimpan'}
        </p>
        <Button size="sm" onClick={openCreate}>
          <Plus /> Template baru
        </Button>
      </div>

      {templates.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-6 py-8 text-center">
          <p className="text-2xl" aria-hidden>
            📋
          </p>
          <p className="mt-1 text-sm font-medium">Belum ada template</p>
          <p className="text-xs text-muted-foreground">
            Contoh: “Susu + roti” Rp 15.000 tiap Senin. Setelah disimpan, template muncul
            sebagai chip di form transaksi.
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {templates.map((template) => {
            const busy = busyId === template.id;
            const income = template.kind === 'income';
            return (
              <li key={template.id} className="rounded-2xl border border-border bg-card p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold">{template.name}</span>
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                          income ? 'bg-income/10 text-income' : 'bg-expense/10 text-expense',
                        )}
                      >
                        {income ? 'Masuk' : 'Keluar'}
                      </span>
                    </div>
                    <p
                      className={cn(
                        'mt-0.5 text-base font-semibold tabular-nums',
                        income ? 'text-income' : 'text-expense',
                      )}
                    >
                      {income ? '+' : '−'}
                      {formatIdr(template.amount)}
                    </p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {[
                        `${template.walletIcon ?? '💳'} ${template.walletName ?? 'Kantong'}`,
                        template.categoryName,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {template.items.length > 0 ? (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {template.items.map((line) => line.name).join(', ')}
                      </p>
                    ) : null}
                    <p className="mt-1 flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
                      <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                      {scheduleLabel(template)}
                      {template.nextRunYmd ? ` · berikutnya ${dayLabel(template.nextRunYmd)}` : ''}
                    </p>
                  </div>
                </div>

                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={busy}
                    onClick={() => void apply(template)}
                  >
                    <Play className="h-3.5 w-3.5" /> Catat sekarang
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5"
                    disabled={busy}
                    onClick={() => openEdit(template)}
                  >
                    <Pencil className="h-3.5 w-3.5" /> Ubah
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-destructive hover:bg-destructive/10"
                    disabled={busy}
                    onClick={() => void remove(template)}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Hapus
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <TemplateEditor
        key={editing?.id ?? 'new'}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        template={editing}
        wallets={wallets}
        categories={categories}
        frequentItems={frequentItems}
      />
    </div>
  );
}

interface TemplateEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: TemplateSummary | null;
  wallets: WalletOption[];
  categories: TemplateCategoryOption[];
  frequentItems: ItemChip[];
}

function TemplateEditor({
  open,
  onOpenChange,
  template,
  wallets,
  categories,
  frequentItems,
}: TemplateEditorProps) {
  const [kind, setKind] = useState<'income' | 'expense'>(template?.kind ?? 'expense');
  const [name, setName] = useState(template?.name ?? '');
  const [amountDigits, setAmountDigits] = useState(template ? String(template.amount) : '');
  const [walletId, setWalletId] = useState(template?.walletId ?? wallets[0]?.id ?? '');
  const [categoryId, setCategoryId] = useState<string | null>(template?.categoryId ?? null);
  const [note, setNote] = useState(template?.note ?? '');
  const [tagsRaw, setTagsRaw] = useState((template?.tags ?? []).join(', '));
  const [frequency, setFrequency] = useState<TemplateFrequency>(template?.frequency ?? 'none');
  const [weekday, setWeekday] = useState(template?.weekday ?? 1);
  const [dayOfMonth, setDayOfMonth] = useState(template?.dayOfMonth ?? 1);
  const [itemLines, setItemLines] = useState<ItemLineDraft[]>(() =>
    (template?.items ?? []).map((line) => makeItemLine(line)),
  );
  const [busy, setBusy] = useState(false);

  const amount = parseAmountInput(amountDigits) ?? 0;
  const visibleCategories = categories.filter((category) => category.kind === kind);

  function switchKind(next: 'income' | 'expense') {
    setKind(next);
    const list = categories.filter((category) => category.kind === next);
    setCategoryId((current) =>
      list.some((category) => category.id === current) ? current : (list[0]?.id ?? null),
    );
  }

  async function submit() {
    if (busy) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error('Nama template wajib diisi');
      return;
    }
    if (amount <= 0) {
      toast.error('Isi nominal dulu');
      return;
    }
    if (!walletId) {
      toast.error('Pilih kantong dulu');
      return;
    }

    const cleanLines = itemLines
      .filter((line) => line.name.trim() && line.amount > 0)
      .map((line) => ({
        itemId: line.itemId,
        name: line.name.trim(),
        amount: line.amount,
        qtyMilli: line.qtyMilli,
      }));
    if (kind === 'expense' && cleanLines.length > 0) {
      const sum = linesTotal(itemLines.filter((line) => line.name.trim() && line.amount > 0));
      if (sum > amount) {
        toast.error(`Total rincian item (${formatIdr(sum)}) melebihi nominal (${formatIdr(amount)})`);
        return;
      }
    }

    const payload = {
      ...(template ? { id: template.id } : {}),
      name: trimmedName,
      kind,
      amount,
      walletId,
      categoryId,
      note: note.trim() ? note.trim() : null,
      tags: tagsRaw
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
      items: kind === 'expense' ? cleanLines : [],
      frequency,
      weekday: frequency === 'weekly' ? weekday : null,
      dayOfMonth: frequency === 'monthly' ? dayOfMonth : null,
    };

    setBusy(true);
    const result = template
      ? await updateTemplateAction(payload)
      : await createTemplateAction(payload);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(template ? 'Template diperbarui' : 'Template disimpan');
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{template ? 'Ubah template' : 'Template baru'}</DialogTitle>
          <DialogDescription>
            Isi sekali, lalu pakai kapan saja — atau nyalakan jadwal agar transaksinya tercatat
            otomatis.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3.5">
          <div className="flex rounded-xl bg-muted p-1" role="tablist" aria-label="Tipe template">
            {(
              [
                { value: 'expense', label: 'Pengeluaran' },
                { value: 'income', label: 'Pemasukan' },
              ] as const
            ).map((segment) => (
              <button
                key={segment.value}
                type="button"
                role="tab"
                aria-selected={kind === segment.value}
                onClick={() => switchKind(segment.value)}
                className={cn(
                  'flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                  kind === segment.value
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {segment.label}
              </button>
            ))}
          </div>

          <div>
            <FieldLabel>Nama template</FieldLabel>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="mis. Susu + roti"
              maxLength={60}
              autoFocus
            />
          </div>

          <div>
            <FieldLabel>Nominal</FieldLabel>
            <Input
              inputMode="numeric"
              value={amount > 0 ? formatAmount(amount) : ''}
              onChange={(event) => {
                const digits = event.target.value.replace(/\D/g, '').slice(0, 15);
                setAmountDigits(digits === '0' ? '' : digits);
              }}
              placeholder="0"
              aria-label="Nominal template"
              className="h-11 text-right text-lg font-semibold tabular-nums"
            />
          </div>

          <div>
            <FieldLabel>Kantong</FieldLabel>
            <div className="no-scrollbar flex flex-nowrap gap-2 overflow-x-auto pb-0.5">
              {wallets.map((wallet) => (
                <Chip
                  key={wallet.id}
                  active={wallet.id === walletId}
                  onClick={() => setWalletId(wallet.id)}
                >
                  <span aria-hidden>{wallet.icon ?? '💳'}</span>
                  {wallet.name}
                </Chip>
              ))}
            </div>
          </div>

          {visibleCategories.length > 0 ? (
            <div>
              <FieldLabel>Kategori</FieldLabel>
              <div className="no-scrollbar flex flex-nowrap gap-2 overflow-x-auto pb-0.5">
                {visibleCategories.map((category) => (
                  <Chip
                    key={category.id}
                    active={category.id === categoryId}
                    onClick={() => setCategoryId(category.id)}
                  >
                    <span aria-hidden>{category.icon ?? '🏷️'}</span>
                    {category.name}
                  </Chip>
                ))}
              </div>
            </div>
          ) : null}

          <div>
            <FieldLabel>Jadwal otomatis</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {FREQUENCY_OPTIONS.map((option) => (
                <Chip
                  key={option.value}
                  active={frequency === option.value}
                  onClick={() => setFrequency(option.value)}
                >
                  {option.label}
                </Chip>
              ))}
            </div>

            {frequency === 'weekly' ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {WEEKDAY_NAMES.map((label, index) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setWeekday(index + 1)}
                    className={cn(
                      'h-8 rounded-lg border px-2.5 text-xs font-medium transition-colors',
                      weekday === index + 1
                        ? 'border-primary bg-accent text-accent-foreground'
                        : 'border-border bg-card text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}

            {frequency === 'monthly' ? (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Tanggal</span>
                <Input
                  inputMode="numeric"
                  value={String(dayOfMonth)}
                  onChange={(event) => {
                    const value = Number(event.target.value.replace(/\D/g, ''));
                    setDayOfMonth(Math.min(Math.max(value || 1, 1), 31));
                  }}
                  aria-label="Tanggal jadwal bulanan"
                  className="h-9 w-16 text-center tabular-nums"
                />
                <span className="text-xs text-muted-foreground">setiap bulan</span>
              </div>
            ) : null}

            {frequency !== 'none' ? (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Transaksi otomatis dicatat saat aplikasi dibuka pada hari jadwalnya.
              </p>
            ) : null}
          </div>

          <div>
            <FieldLabel>Catatan</FieldLabel>
            <Input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Opsional"
              maxLength={280}
            />
          </div>

          <div>
            <FieldLabel>Tag</FieldLabel>
            <Input
              value={tagsRaw}
              onChange={(event) => setTagsRaw(event.target.value)}
              placeholder="Pisahkan dengan koma (opsional)"
            />
          </div>

          {kind === 'expense' ? (
            <ItemLines
              lines={itemLines}
              setLines={setItemLines}
              suggestions={frequentItems}
              total={amount}
              onUseLinesTotal={() => setAmountDigits(String(linesTotal(itemLines)))}
              disabled={busy}
            />
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Batal
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {busy ? 'Menyimpan…' : template ? 'Simpan perubahan' : 'Simpan template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-1.5 text-xs font-medium text-muted-foreground">{children}</p>;
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors',
        active
          ? 'border-primary bg-accent font-medium text-accent-foreground'
          : 'border-border bg-card text-foreground hover:bg-muted',
      )}
    >
      {children}
    </button>
  );
}
