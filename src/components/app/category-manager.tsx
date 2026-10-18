'use client';

import { useEffect, useState } from 'react';
import { Archive, ArchiveRestore, MoreVertical, Pencil, Plus, Trash2 } from 'lucide-react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { CATEGORY_ICONS, WALLET_COLORS } from '@/lib/view-types';
import {
  createCategoryAction,
  deleteCategoryAction,
  setCategoryArchivedAction,
  updateCategoryAction,
} from '@/server/actions/categories';

export interface CategoryTarget {
  id: string;
  name: string;
  kind: 'income' | 'expense';
  icon: string | null;
  color: string | null;
  archived: boolean;
}

function CategoryFormDialog({
  open,
  onOpenChange,
  kind,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: 'income' | 'expense';
  initial?: CategoryTarget | null;
}) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<string>(CATEGORY_ICONS[0]);
  const [color, setColor] = useState<string>(WALLET_COLORS[0]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? '');
    setIcon(initial?.icon ?? CATEGORY_ICONS[0]);
    setColor(initial?.color ?? WALLET_COLORS[0]);
  }, [initial, open]);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Nama kategori wajib diisi');
      return;
    }
    setBusy(true);
    const result = initial
      ? await updateCategoryAction({ categoryId: initial.id, name: trimmed, icon, color })
      : await createCategoryAction({ name: trimmed, kind, icon, color });
    setBusy(false);
    if (result.ok) {
      toast.success(initial ? 'Kategori diperbarui' : 'Kategori dibuat');
      onOpenChange(false);
    } else {
      toast.error(result.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {initial ? 'Ubah kategori' : kind === 'expense' ? 'Kategori pengeluaran baru' : 'Kategori pemasukan baru'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="category-name">Nama</Label>
            <Input
              id="category-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={kind === 'expense' ? 'Makan, Transport…' : 'Gaji, Usaha…'}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>Ikon</Label>
            <div className="grid grid-cols-8 gap-1">
              {CATEGORY_ICONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setIcon(emoji)}
                  aria-label={`Ikon ${emoji}`}
                  className={cn(
                    'flex h-9 items-center justify-center rounded-lg text-lg transition-colors',
                    icon === emoji ? 'bg-accent ring-2 ring-primary' : 'bg-muted hover:bg-muted/70',
                  )}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Warna</Label>
            <div className="flex flex-wrap gap-2">
              {WALLET_COLORS.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => setColor(hex)}
                  aria-label={`Warna ${hex}`}
                  className={cn(
                    'h-7 w-7 rounded-full transition-transform',
                    color === hex && 'scale-110 ring-2 ring-foreground ring-offset-2 ring-offset-card',
                  )}
                  style={{ background: hex }}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {busy ? 'Menyimpan…' : initial ? 'Simpan' : 'Buat kategori'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CategoryGroup({
  title,
  kind,
  categories,
}: {
  title: string;
  kind: 'income' | 'expense';
  categories: CategoryTarget[];
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CategoryTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CategoryTarget | null>(null);
  const [busy, setBusy] = useState(false);

  const active = categories.filter((category) => !category.archived);
  const archived = categories.filter((category) => category.archived);

  async function toggleArchive(category: CategoryTarget) {
    const result = await setCategoryArchivedAction({
      categoryId: category.id,
      archived: !category.archived,
    });
    if (result.ok) {
      toast.success(category.archived ? 'Kategori diaktifkan kembali' : 'Kategori diarsipkan');
    } else {
      toast.error(result.error);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    const result = await deleteCategoryAction(deleteTarget.id);
    setBusy(false);
    setDeleteTarget(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    if (result.data.deleted) {
      toast.success('Kategori dihapus');
    } else {
      toast.error('Kategori sudah dipakai transaksi — arsipkan saja agar riwayat tetap rapi.');
    }
  }

  function renderRow(category: CategoryTarget) {
    return (
      <div key={category.id} className="flex items-center gap-2 px-3 py-2">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-base"
          style={category.color ? { backgroundColor: `${category.color}26` } : undefined}
          aria-hidden
        >
          {category.icon ?? (kind === 'expense' ? '🏷️' : '💰')}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm">{category.name}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Aksi untuk ${category.name}`}>
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={() => setEditTarget(category)}>
              <Pencil /> Ubah
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void toggleArchive(category)}>
              {category.archived ? <ArchiveRestore /> : <Archive />}
              {category.archived ? 'Aktifkan kembali' : 'Arsipkan'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => setDeleteTarget(category)}>
              <Trash2 /> Hapus
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Button variant="ghost" size="sm" className="gap-1 text-primary" onClick={() => setCreateOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Tambah
        </Button>
      </div>
      <div className="divide-y divide-border">
        {active.map(renderRow)}
        {active.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">
            Belum ada kategori {kind === 'expense' ? 'pengeluaran' : 'pemasukan'}.
          </p>
        ) : null}
      </div>
      {archived.length > 0 ? (
        <div className="border-t border-border">
          <p className="px-3 pt-2 text-[11px] uppercase tracking-wide text-muted-foreground">
            Diarsipkan
          </p>
          <div className="divide-y divide-border opacity-70">{archived.map(renderRow)}</div>
        </div>
      ) : null}

      <CategoryFormDialog open={createOpen} onOpenChange={setCreateOpen} kind={kind} />
      <CategoryFormDialog
        open={editTarget !== null}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
        kind={kind}
        initial={editTarget}
      />

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => (!open ? setDeleteTarget(null) : undefined)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Hapus kategori “{deleteTarget?.name}”?</DialogTitle>
            <DialogDescription>
              Kategori yang sudah dipakai transaksi tidak bisa dihapus, hanya bisa diarsipkan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Batal
            </Button>
            <Button variant="destructive" onClick={() => void confirmDelete()} disabled={busy}>
              {busy ? 'Menghapus…' : 'Hapus'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function CategoryManager({ categories }: { categories: CategoryTarget[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <CategoryGroup
        title="Pengeluaran"
        kind="expense"
        categories={categories.filter((category) => category.kind === 'expense')}
      />
      <CategoryGroup
        title="Pemasukan"
        kind="income"
        categories={categories.filter((category) => category.kind === 'income')}
      />
    </div>
  );
}
