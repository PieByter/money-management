'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
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
import { Label } from '@/components/ui/label';
import { deleteAccountAction } from '@/server/actions/auth';

export function DeleteAccountCard({ supabaseMode }: { supabaseMode: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    const result = await deleteAccountAction(confirmation);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setOpen(false);
    toast.success(
      result.data.authUserDeleted
        ? 'Akun dan seluruh data dihapus.'
        : 'Semua data dihapus. Akun login masih ada — keluar lalu daftar ulang bila perlu.',
      { duration: 8000 },
    );
    if (supabaseMode) {
      router.push('/login');
      router.refresh();
    } else {
      router.refresh();
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Menghapus akun akan menghapus permanen semua kantong, kategori, transaksi, dan budget.
        Unduh CSV dulu kalau masih ingin menyimpannya.
      </p>
      <Button variant="destructive" className="gap-2" onClick={() => setOpen(true)}>
        <Trash2 /> Hapus akun &amp; semua data
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setConfirmation('');
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Hapus akun?</DialogTitle>
            <DialogDescription>
              Semua data keuanganmu dihapus permanen dan tidak bisa dikembalikan. Ketik{' '}
              <b>HAPUS</b> untuk melanjutkan.
              {supabaseMode ? (
                <>
                  {' '}
                  Akun login Supabase juga ikut dihapus bila <code>SUPABASE_SECRET_KEY</code> sudah
                  diisi.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="delete-account-confirm">Konfirmasi</Label>
            <Input
              id="delete-account-confirm"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder="HAPUS"
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button
              variant="destructive"
              disabled={busy || confirmation.trim() !== 'HAPUS'}
              onClick={() => void submit()}
            >
              {busy ? 'Menghapus…' : 'Hapus permanen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
