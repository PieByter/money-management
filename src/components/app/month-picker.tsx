'use client';

import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { jakartaYearMonth, monthKey, monthLabel, parseMonthKey, shiftMonthKey } from '@/lib/dates';

/**
 * Pemilih bulan: tombol + swipe horizontal (PRD 6, interaksi antar bulan).
 */
export function MonthPicker({ month, paramName = 'm' }: { month: string; paramName?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const goTo = (next: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(paramName, next);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const shift = (delta: number) => goTo(shiftMonthKey(month, delta));
  const label = monthLabel(parseMonthKey(month));
  const currentKey = monthKey(jakartaYearMonth());

  return (
    <div className="flex items-center justify-between gap-1">
      <button
        type="button"
        onClick={() => shift(-1)}
        aria-label="Bulan sebelumnya"
        className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.06}
        onDragEnd={(_, info) => {
          if (info.offset.x > 56) shift(-1);
          else if (info.offset.x < -56) shift(1);
        }}
        className="flex-1 cursor-grab touch-pan-y select-none text-center active:cursor-grabbing"
      >
        <p className="text-base font-semibold">{label}</p>
        {month === currentKey ? (
          <p className="text-[11px] text-muted-foreground">Bulan berjalan</p>
        ) : (
          <button
            type="button"
            onClick={() => goTo(currentKey)}
            className="text-[11px] font-medium text-primary hover:underline"
          >
            Kembali ke bulan ini
          </button>
        )}
      </motion.div>
      <button
        type="button"
        onClick={() => shift(1)}
        aria-label="Bulan berikutnya"
        className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
}
