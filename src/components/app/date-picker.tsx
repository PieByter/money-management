'use client';

import { useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  WEEKDAY_LABELS,
  dayLabel,
  dayOfMonth,
  jakartaYmd,
  jakartaYearMonth,
  longDateLabel,
  monthKey,
  monthGrid,
  monthLabel,
  parseMonthKey,
  shiftMonthKey,
  shiftYmd,
  ymKeyOfDay,
} from '@/lib/dates';
import { cn } from '@/lib/utils';

/**
 * Pemilih tanggal berbasis kalender WIB — cukup ketuk, tanpa mengetik.
 * Dipakai form transaksi (dan bisa dipakai form lain).
 */
export function DatePicker({
  value,
  onChange,
  disabled,
  className,
}: {
  value: string;
  onChange: (ymd: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const todayYmd = jakartaYmd(new Date());
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => ymKeyOfDay(value || todayYmd));

  // "Hari ini"/"Kemarin" perlu tanggal lengkap di sebelahnya; tanggal lain sudah jelas.
  const relativeLabel = dayLabel(value) === 'Hari ini' || dayLabel(value) === 'Kemarin';
  const absoluteLabel = `${dayOfMonth(value)} ${monthLabel(parseMonthKey(ymKeyOfDay(value)))}`;

  function openPicker() {
    setViewMonth(ymKeyOfDay(value || todayYmd));
    setOpen(true);
  }

  function pick(ymd: string) {
    onChange(ymd);
    setOpen(false);
  }

  const grid = monthGrid(viewMonth);
  const currentMonthKey = monthKey(jakartaYearMonth());

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
        disabled={disabled}
        aria-label={`Tanggal transaksi: ${longDateLabel(value)}`}
        className={cn(
          'flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-border bg-card px-2.5 text-sm transition-colors hover:bg-muted disabled:opacity-40',
          className,
        )}
      >
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{dayLabel(value)}</span>
        {relativeLabel ? (
          <span className="text-xs text-muted-foreground">{absoluteLabel}</span>
        ) : null}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm" data-lock-sheet-keys="true">
          <DialogHeader>
            <DialogTitle>Pilih tanggal</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => pick(todayYmd)}
                className={cn(
                  'rounded-xl border px-3 py-1.5 text-sm transition-colors',
                  value === todayYmd
                    ? 'border-primary bg-accent font-medium text-accent-foreground'
                    : 'border-border bg-card hover:bg-muted',
                )}
              >
                Hari ini
              </button>
              <button
                type="button"
                onClick={() => pick(shiftYmd(todayYmd, -1))}
                className={cn(
                  'rounded-xl border px-3 py-1.5 text-sm transition-colors',
                  value === shiftYmd(todayYmd, -1)
                    ? 'border-primary bg-accent font-medium text-accent-foreground'
                    : 'border-border bg-card hover:bg-muted',
                )}
              >
                Kemarin
              </button>
            </div>

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setViewMonth((prev) => shiftMonthKey(prev, -1))}
                aria-label="Bulan sebelumnya"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <p className="text-sm font-medium">{monthLabel(parseMonthKey(viewMonth))}</p>
              <button
                type="button"
                onClick={() => setViewMonth((prev) => shiftMonthKey(prev, 1))}
                aria-label="Bulan berikutnya"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center">
              {WEEKDAY_LABELS.map((label) => (
                <span key={label} className="pb-1 text-[11px] font-medium text-muted-foreground">
                  {label}
                </span>
              ))}
              {grid.cells.map((ymd, index) => {
                if (!ymd) return <span key={`pad-${index}`} />;
                const isSelected = ymd === value;
                const isToday = ymd === todayYmd;
                return (
                  <button
                    key={ymd}
                    type="button"
                    onClick={() => pick(ymd)}
                    aria-label={longDateLabel(ymd)}
                    aria-current={isSelected ? 'date' : undefined}
                    className={cn(
                      'flex h-9 items-center justify-center rounded-lg text-sm tabular-nums transition-colors',
                      isSelected
                        ? 'bg-primary font-semibold text-primary-foreground'
                        : isToday
                          ? 'border border-primary/60 font-medium text-primary hover:bg-muted'
                          : 'text-foreground hover:bg-muted',
                    )}
                  >
                    {dayOfMonth(ymd)}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
              <span>{longDateLabel(value)}</span>
              {viewMonth !== currentMonthKey ? (
                <button
                  type="button"
                  onClick={() => setViewMonth(currentMonthKey)}
                  className="font-medium text-primary hover:underline"
                >
                  Ke bulan ini
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Batal
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
