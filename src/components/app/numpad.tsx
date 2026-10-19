'use client';

import { Delete } from 'lucide-react';
import { cn } from '@/lib/utils';

export type NumpadKey =
  | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '0'
  | '000'
  | 'back'
  | 'clear';

const ROWS: NumpadKey[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['clear', '0', 'back'],
];

/**
 * Numpad besar untuk input cepat satu tangan (PRD 5.3).
 * Tiga kolom agar tombolnya lega; penambah ribuan (`000`) jadi satu tombol lebar
 * di bawah.
 */
export function Numpad({ onKey }: { onKey: (key: NumpadKey) => void }) {
  return (
    <div role="group" aria-label="Papan angka" className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        {ROWS.flatMap((row, rowIndex) =>
          row.map((key, colIndex) => {
            const isFunction = key === 'back' || key === 'clear';
            return (
              <button
                key={key}
                type="button"
                onClick={() => onKey(key)}
                aria-label={keyLabel(key)}
                className={cn(
                  'flex h-12 items-center justify-center rounded-xl text-2xl font-medium transition-colors active:scale-[0.97] lg:h-14',
                  isFunction ? 'bg-secondary text-muted-foreground' : 'bg-muted text-foreground',
                  key === 'clear' && 'text-base',
                )}
                data-row={rowIndex}
                data-col={colIndex}
              >
                {key === 'back' ? (
                  <Delete className="h-5 w-5" />
                ) : key === 'clear' ? (
                  'C'
                ) : (
                  key
                )}
              </button>
            );
          }),
        )}
      </div>
      <button
        type="button"
        onClick={() => onKey('000')}
        aria-label="Tambah tiga nol"
        className="flex h-11 w-full items-center justify-center rounded-xl bg-secondary text-2xl font-medium text-foreground transition-colors active:scale-[0.99] lg:h-12"
      >
        000
      </button>
    </div>
  );
}

function keyLabel(key: NumpadKey): string {
  switch (key) {
    case 'back':
      return 'Hapus satu angka';
    case 'clear':
      return 'Kosongkan nominal';
    case '000':
      return 'Tambah tiga nol';
    default:
      return `Angka ${key}`;
  }
}
