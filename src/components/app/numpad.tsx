'use client';

import { Delete } from 'lucide-react';
import { cn } from '@/lib/utils';

export type NumpadKey =
  | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '0'
  | '000'
  | 'rb'
  | 'back'
  | 'clear';

const ROWS: (NumpadKey | null)[][] = [
  ['1', '2', '3', 'back'],
  ['4', '5', '6', 'rb'],
  ['7', '8', '9', '000'],
  ['0', 'clear'],
];

/** Numpad besar untuk input cepat satu tangan (PRD 5.3). */
export function Numpad({ onKey }: { onKey: (key: NumpadKey) => void }) {
  return (
    <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Papan angka">
      {ROWS.flatMap((row, rowIndex) =>
        row.map((key, colIndex) => {
          if (key === null) return null;
          const isFunction = key === 'back' || key === 'rb' || key === '000' || key === 'clear';
          return (
            <button
              key={key}
              type="button"
              onClick={() => onKey(key)}
              aria-label={keyLabel(key)}
              className={cn(
                'flex h-12 items-center justify-center rounded-xl text-xl font-medium transition-colors active:scale-[0.97]',
                isFunction
                  ? 'bg-secondary text-muted-foreground'
                  : 'bg-muted text-foreground',
                key === 'clear' && 'text-sm',
                key === 'rb' && 'text-base font-semibold text-primary',
              )}
              style={{ gridColumn: key === '0' ? 'span 3' : undefined }}
              data-row={rowIndex}
              data-col={colIndex}
            >
              {key === 'back' ? (
                <Delete className="h-5 w-5" />
              ) : key === 'rb' ? (
                'rb'
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
  );
}

function keyLabel(key: NumpadKey): string {
  switch (key) {
    case 'back':
      return 'Hapus satu angka';
    case 'clear':
      return 'Kosongkan nominal';
    case 'rb':
      return 'Kali seribu (ribu)';
    case '000':
      return 'Tambah tiga nol';
    default:
      return `Angka ${key}`;
  }
}
