'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CircleAlert, ImageIcon, Loader2, RefreshCw, ScanLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { prepareReceiptImage, type PreparedReceiptImage } from '@/lib/image-client';
import type { ReceiptScanDraft } from '@/lib/receipt';
import { scanReceiptAction } from '@/server/actions/receipts';

interface ReceiptScannerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  aiReady: boolean;
  onScanned: (draft: ReceiptScanDraft) => void;
}

export function ReceiptScanner({ open, onOpenChange, aiReady, onScanned }: ReceiptScannerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const runRef = useRef(0);
  const [prepared, setPrepared] = useState<PreparedReceiptImage | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Setiap kali dialog dibuka, mulai dari keadaan bersih.
  useEffect(() => {
    if (!open) return;
    runRef.current += 1;
    setPrepared(null);
    setFileName(null);
    setBusy(false);
    setStatus('');
    setError(null);
  }, [open]);

  // Hasil request yang selesai setelah dialog ditutup tidak boleh mengubah form.
  useEffect(() => {
    if (!open) runRef.current += 1;
  }, [open]);

  const startScan = useCallback(
    async (image: PreparedReceiptImage) => {
      const run = ++runRef.current;
      setBusy(true);
      setStatus('Membaca struk…');
      setError(null);
      try {
        const result = await scanReceiptAction({
          imageBase64: image.base64,
          mimeType: image.mimeType,
        });
        if (run !== runRef.current) return;
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onScanned(result.data);
      } catch (scanError) {
        if (run !== runRef.current) return;
        setError(scanError instanceof Error ? scanError.message : 'Gagal memindai struk.');
      } finally {
        if (run === runRef.current) {
          setBusy(false);
          setStatus('');
        }
      }
    },
    [onScanned],
  );

  const handleFile = useCallback(
    async (file: File) => {
      const run = ++runRef.current;
      setPrepared(null);
      setFileName(file.name);
      setError(null);
      setBusy(true);
      setStatus('Menyiapkan foto…');
      try {
        const image = await prepareReceiptImage(file);
        if (run !== runRef.current) return;
        setPrepared(image);
        await startScan(image);
      } catch (prepareError) {
        if (run !== runRef.current) return;
        setError(
          prepareError instanceof Error ? prepareError.message : 'Gagal menyiapkan foto struk.',
        );
        setBusy(false);
        setStatus('');
      }
    },
    [startScan],
  );

  function openPicker() {
    inputRef.current?.click();
  }

  function reset() {
    runRef.current += 1;
    setPrepared(null);
    setFileName(null);
    setBusy(false);
    setStatus('');
    setError(null);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="h-5 w-5 text-primary" />
            Scan struk
          </DialogTitle>
          <DialogDescription>
            Foto struk akan dibaca AI dan diubah menjadi draft pengeluaran. Periksa lagi sebelum
            menyimpan.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void handleFile(file);
          }}
        />

        {!aiReady ? (
          <div className="space-y-3">
            <div className="flex gap-2.5 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-sm">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="space-y-2">
                <p className="font-medium">Scan struk belum aktif</p>
                <p className="text-muted-foreground">
                  Pilih salah satu penyedia gratis, isi env-nya, lalu restart aplikasi:
                </p>
                <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                  <li>
                    <span className="font-medium text-foreground">Gemini</span> —{' '}
                    <code className="rounded bg-muted px-1">GEMINI_API_KEY</code> dari{' '}
                    <span className="break-all">aistudio.google.com/apikey</span>
                  </li>
                  <li>
                    <span className="font-medium text-foreground">OpenRouter</span> —{' '}
                    <code className="rounded bg-muted px-1">OPENROUTER_API_KEY</code> (model vision
                    <code className="ml-1 rounded bg-muted px-1">:free</code>)
                  </li>
                  <li>
                    <span className="font-medium text-foreground">Ollama lokal</span> —{' '}
                    <code className="rounded bg-muted px-1">OLLAMA_BASE_URL</code>, lalu{' '}
                    <code className="rounded bg-muted px-1">ollama pull qwen3-vl:4b</code>
                  </li>
                </ul>
              </div>
            </div>
            <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
              Tutup
            </Button>
          </div>
        ) : prepared ? (
          <div className="space-y-3">
            <div className="relative overflow-hidden rounded-2xl border border-border bg-muted">
              {prepared.dataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={prepared.dataUrl}
                  alt={`Pratinjau ${fileName ?? 'struk'}`}
                  className="max-h-64 w-full object-contain"
                />
              ) : (
                <div className="flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground">
                  <ImageIcon className="h-8 w-8" />
                  <span className="text-xs">Pratinjau tidak tersedia untuk format ini</span>
                </div>
              )}
              {busy ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/80 backdrop-blur-sm">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <p className="text-sm font-medium">{status || 'Memproses…'}</p>
                </div>
              ) : null}
            </div>

            {error ? (
              <div className="flex gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{error}</p>
              </div>
            ) : busy ? (
              <p className="text-center text-xs text-muted-foreground">
                Biasanya 3–15 detik. Jangan tutup dialog.
              </p>
            ) : null}

            {!busy ? (
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={reset}>
                  <Camera className="mr-1.5 h-4 w-4" />
                  Ganti foto
                </Button>
                <Button className="flex-1" onClick={() => void startScan(prepared)}>
                  <RefreshCw className="mr-1.5 h-4 w-4" />
                  Coba lagi
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            <button
              type="button"
              onClick={openPicker}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const file = event.dataTransfer.files?.[0];
                if (file) void handleFile(file);
              }}
              className="group flex w-full flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-5 py-8 text-center transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary transition-transform group-hover:scale-105">
                <Camera className="h-7 w-7" />
              </span>
              <span className="space-y-1">
                <span className="block text-sm font-medium">Foto atau pilih gambar struk</span>
                <span className="block text-xs text-muted-foreground">
                  JPG, PNG, WebP, atau HEIC · otomatis diperkecil
                </span>
              </span>
            </button>

            {busy ? (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {status || 'Memproses…'}
              </div>
            ) : null}

            {error ? (
              <div className="flex gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{error}</p>
              </div>
            ) : null}

            <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
              Foto hanya dikirim ke penyedia AI untuk dibaca dan tidak disimpan di database. Pada
              free tier, penyedia dapat memakai data untuk peningkatan layanan.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
