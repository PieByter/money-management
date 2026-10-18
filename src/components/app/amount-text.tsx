import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Scale } from 'lucide-react';
import { formatIdr } from '@/lib/money';
import { cn } from '@/lib/utils';

export type Tone = 'income' | 'expense' | 'neutral';

export function toneForKind(kind: string): Tone {
  if (kind === 'income') return 'income';
  if (kind === 'expense') return 'expense';
  return 'neutral';
}

export function toneClass(tone: Tone): string {
  if (tone === 'income') return 'text-income';
  if (tone === 'expense') return 'text-expense';
  return 'text-foreground';
}

const TONE_ICON = {
  income: ArrowDownLeft,
  expense: ArrowUpRight,
  neutral: ArrowLeftRight,
} as const;

/**
 * Angka selalu terbaca: warna + ikon panah + tanda eksplisit (PRD 6.3),
 * tidak hanya mengandalkan warna.
 */
export function AmountText({
  kind,
  amount,
  className,
}: {
  kind: string;
  amount: number;
  className?: string;
}) {
  const tone = toneForKind(kind);
  const Icon = kind === 'adjustment' ? Scale : TONE_ICON[tone];
  const sign = tone === 'income' ? '+' : tone === 'expense' ? '−' : '';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap font-semibold tabular-nums',
        toneClass(tone),
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>
        {sign}
        {formatIdr(amount)}
      </span>
    </span>
  );
}
