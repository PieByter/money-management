'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, FileJson, FileSpreadsheet, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { csvRowsToObjects, parseCsv } from '@/lib/csv';
import { formatIdr, parseAmountInput } from '@/lib/money';
import type { CsvImportRow } from '@/lib/schemas';
import { importCsvAction, restoreBackupAction } from '@/server/actions/data';

const KIND_MAP: Record<string, CsvImportRow['kind']> = {
  income: 'income',
  masuk: 'income',
  pemasukan: 'income',
  expense: 'expense',
  keluar: 'expense',
  pengeluaran: 'expense',
  transfer_in: 'transfer_in',
  'transfer masuk': 'transfer_in',
  transfer_out: 'transfer_out',
  'transfer keluar': 'transfer_out',
  adjustment_in: 'adjustment_in',
  adjustment_out: 'adjustment_out',
};

interface ParsedPreview {
  rows: CsvImportRow[];
  errors: string[];
  total: number;
}

function pick(row: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== '') return value;
  }
  return '';
}

function normalizeDate(raw: string): { date: string; time: string | null } | null {
  const value = raw.trim();
  if (!value) return null;
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2}))?/);
  if (iso) {
    const time = iso[4] ? `${iso[4].padStart(2, '0')}:${iso[5]}` : null;
    return { date: `${iso[1]}-${iso[2]}-${iso[3]}`, time };
  }
  const m = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    return {
      date: `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`,
      time: null,
    };
  }
  return null;
}

function normalizeTime(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function uuidOrNull(value: string): string | null {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

function parseRows(raw: string): ParsedPreview {
  const objects = csvRowsToObjects(parseCsv(raw));
  const rows: CsvImportRow[] = [];
  const errors: string[] = [];

  objects.forEach((row, index) => {
    const line = index + 2; // baris 1 = header
    const dateRaw = pick(row, ['tanggal', 'date']);
    const parsedDate = normalizeDate(dateRaw);
    if (!parsedDate) {
      errors.push(`Baris ${line}: tanggal "${dateRaw}" tidak dikenali`);
      return;
    }
    const kindRaw = pick(row, ['tipe', 'kind', 'type']).toLowerCase();
    const kind = KIND_MAP[kindRaw];
    if (!kind) {
      errors.push(
        `Baris ${line}: tipe "${kindRaw}" tidak dikenal (pakai income/expense/transfer_in/transfer_out/adjustment_in/adjustment_out)`,
      );
      return;
    }
    const walletName = pick(row, ['kantong', 'wallet']);
    if (!walletName) {
      errors.push(`Baris ${line}: nama kantong kosong`);
      return;
    }
    const amount = parseAmountInput(pick(row, ['nominal', 'amount', 'jumlah']));
    if (amount === null) {
      errors.push(`Baris ${line}: nominal tidak valid`);
      return;
    }
    const timeRaw = pick(row, ['waktu', 'time']);
    const time = normalizeTime(timeRaw) ?? parsedDate.time;
    const tagsRaw = pick(row, ['tag', 'tags']);
    const tags = tagsRaw
      ? tagsRaw
          .split(/[,;|]/)
          .map((tag) => tag.trim())
          .filter(Boolean)
          .slice(0, 10)
      : [];

    rows.push({
      date: parsedDate.date,
      time,
      kind,
      walletName,
      categoryName: pick(row, ['kategori', 'category']) || null,
      amount,
      note: pick(row, ['catatan', 'note', 'keterangan']) || null,
      tags,
      groupId: uuidOrNull(pick(row, ['group_id', 'groupid', 'group'])),
    });
  });

  return { rows, errors, total: objects.length };
}

export function DataTools() {
  const router = useRouter();
  const csvInput = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ParsedPreview | null>(null);
  const [csvName, setCsvName] = useState('');
  const [importing, setImporting] = useState(false);
  const [backup, setBackup] = useState<{ raw: string; name: string; size: number } | null>(null);
  const [confirm, setConfirm] = useState('');
  const [restoring, setRestoring] = useState(false);

  async function onCsvFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File CSV maksimal 5 MB');
      return;
    }
    setCsvName(file.name);
    const raw = await file.text();
    setPreview(parseRows(raw));
  }

  async function runImport() {
    if (!preview || preview.rows.length === 0) return;
    setImporting(true);
    const result = await importCsvAction({ rows: preview.rows });
    setImporting(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    const { imported, walletsCreated, categoriesCreated } = result.data;
    toast.success(
      `${imported} transaksi diimpor` +
        (walletsCreated || categoriesCreated
          ? ` · ${walletsCreated} kantong & ${categoriesCreated} kategori dibuat`
          : ''),
    );
    setPreview(null);
    setCsvName('');
    if (csvInput.current) csvInput.current.value = '';
    router.refresh();
  }

  async function onBackupFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File backup maksimal 10 MB');
      return;
    }
    setBackup({ raw: await file.text(), name: file.name, size: file.size });
    setConfirm('');
  }

  async function runRestore() {
    if (!backup || confirm !== 'PULIHKAN') return;
    setRestoring(true);
    const result = await restoreBackupAction(backup.raw);
    setRestoring(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      `Backup dipulihkan · ${result.data.transactions} transaksi, ${result.data.wallets} kantong`,
    );
    setBackup(null);
    setConfirm('');
    if (backupInput.current) backupInput.current.value = '';
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <a
          href="/api/export"
          download
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-medium transition-colors hover:bg-muted"
        >
          <FileSpreadsheet className="h-4 w-4" /> Ekspor CSV
        </a>
        <a
          href="/api/backup"
          download
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-medium transition-colors hover:bg-muted"
        >
          <FileJson className="h-4 w-4" /> Ekspor backup JSON
        </a>
      </div>
      <p className="text-xs text-muted-foreground">
        Backup JSON berisi seluruh data (kantong, transaksi, item, template, budget, tujuan,
        hutang/piutang). CSV cocok untuk dibuka di Excel/Google Sheets.
      </p>

      <details className="rounded-xl border border-border p-3">
        <summary className="cursor-pointer text-sm font-medium">
          <Upload className="mr-1 inline h-4 w-4" /> Impor transaksi dari CSV
        </summary>
        <div className="mt-3 space-y-3">
          <p className="text-xs text-muted-foreground">
            Gunakan format hasil ekspor (tanggal; waktu; tipe; kantong; kategori; nominal; catatan;
            group_id). Kantong dan kategori yang belum ada akan dibuat otomatis.
          </p>
          <Input
            ref={csvInput}
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => void onCsvFile(event.target.files?.[0])}
            aria-label="Pilih file CSV"
          />
          {preview ? (
            <div className="space-y-2">
              <p className="text-xs">
                <span className="font-medium">{csvName}</span> · {preview.total} baris ·{' '}
                <span className={preview.errors.length > 0 ? 'text-expense' : 'text-income'}>
                  {preview.rows.length} valid
                  {preview.errors.length > 0 ? `, ${preview.errors.length} error` : ''}
                </span>
              </p>
              {preview.rows.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full min-w-[520px] text-left text-xs">
                    <thead className="bg-muted/60 text-muted-foreground">
                      <tr>
                        <th className="px-2 py-1.5 font-medium">Tanggal</th>
                        <th className="px-2 py-1.5 font-medium">Tipe</th>
                        <th className="px-2 py-1.5 font-medium">Kantong</th>
                        <th className="px-2 py-1.5 font-medium">Kategori</th>
                        <th className="px-2 py-1.5 text-right font-medium">Nominal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {preview.rows.slice(0, 5).map((row, index) => (
                        <tr key={`${row.date}-${index}`}>
                          <td className="px-2 py-1.5 tabular-nums">
                            {row.date}
                            {row.time ? ` ${row.time}` : ''}
                          </td>
                          <td className="px-2 py-1.5">{row.kind}</td>
                          <td className="max-w-[120px] truncate px-2 py-1.5">{row.walletName}</td>
                          <td className="max-w-[120px] truncate px-2 py-1.5">
                            {row.categoryName ?? '—'}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums">
                            {formatIdr(row.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {preview.errors.length > 0 ? (
                <ul className="space-y-1 text-xs text-expense">
                  {preview.errors.slice(0, 4).map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                  {preview.errors.length > 4 ? (
                    <li>…dan {preview.errors.length - 4} error lain.</li>
                  ) : null}
                </ul>
              ) : null}
              <Button
                size="sm"
                disabled={importing || preview.rows.length === 0 || preview.errors.length > 0}
                onClick={() => void runImport()}
              >
                {importing ? 'Mengimpor…' : `Impor ${preview.rows.length} transaksi`}
              </Button>
            </div>
          ) : null}
        </div>
      </details>

      <details className="rounded-xl border border-expense/30 p-3">
        <summary className="cursor-pointer text-sm font-medium text-expense">
          <Download className="mr-1 inline h-4 w-4" /> Pulihkan backup JSON
        </summary>
        <div className="mt-3 space-y-3">
          <p className="rounded-lg bg-expense/5 px-3 py-2 text-xs text-expense">
            Restore <strong>mengganti seluruh data</strong> akun ini dengan isi file. Buat backup
            terbaru dulu sebelum melanjutkan.
          </p>
          <Input
            ref={backupInput}
            type="file"
            accept="application/json,.json"
            onChange={(event) => void onBackupFile(event.target.files?.[0])}
            aria-label="Pilih file backup JSON"
          />
          {backup ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {backup.name} · {(backup.size / 1024).toFixed(1)} KB
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="restore-confirm">
                  Ketik <span className="font-mono font-semibold">PULIHKAN</span> untuk konfirmasi
                </Label>
                <Input
                  id="restore-confirm"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  autoComplete="off"
                  placeholder="PULIHKAN"
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                className="border-expense text-expense"
                disabled={restoring || confirm !== 'PULIHKAN'}
                onClick={() => void runRestore()}
              >
                {restoring ? 'Memulihkan…' : 'Pulihkan sekarang'}
              </Button>
            </div>
          ) : null}
        </div>
      </details>
    </div>
  );
}
