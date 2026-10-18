import { and, eq, sql } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import { categories, type CategoryKind } from '../db/schema';

interface SeedCategory {
  name: string;
  kind: CategoryKind;
  icon: string;
  color: string;
}

const DEFAULT_CATEGORIES: SeedCategory[] = [
  { name: 'Makan', kind: 'expense', icon: '🍜', color: '#f97316' },
  { name: 'Transport', kind: 'expense', icon: '🚌', color: '#0ea5e9' },
  { name: 'Belanja', kind: 'expense', icon: '🛒', color: '#ec4899' },
  { name: 'Tagihan', kind: 'expense', icon: '🧾', color: '#8b5cf6' },
  { name: 'Kesehatan', kind: 'expense', icon: '💊', color: '#ef4444' },
  { name: 'Hiburan', kind: 'expense', icon: '🎬', color: '#f59e0b' },
  { name: 'Pendidikan', kind: 'expense', icon: '🎓', color: '#6366f1' },
  { name: 'Biaya Admin', kind: 'expense', icon: '🏦', color: '#64748b' },
  { name: 'Lainnya', kind: 'expense', icon: '📦', color: '#94a3b8' },
  { name: 'Gaji', kind: 'income', icon: '💼', color: '#10b981' },
  { name: 'Usaha', kind: 'income', icon: '🏪', color: '#14b8a6' },
  { name: 'Bonus', kind: 'income', icon: '🎁', color: '#22c55e' },
  { name: 'Bunga', kind: 'income', icon: '💹', color: '#84cc16' },
  { name: 'Lainnya', kind: 'income', icon: '💰', color: '#94a3b8' },
];

/**
 * Seed kategori default sekali per user (idempotent).
 * Dipanggil dari layout aplikasi sehingga "migrasi + seed jalan dari nol"
 * tanpa perintah tambahan.
 */
export async function ensureDefaults(db: AppDb, userId: string): Promise<void> {
  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(categories)
    .where(eq(categories.userId, userId));
  if (Number(row?.value ?? 0) > 0) return;

  await db.insert(categories).values(
    DEFAULT_CATEGORIES.map((category, index) => ({
      userId,
      name: category.name,
      kind: category.kind,
      icon: category.icon,
      color: category.color,
      sortOrder: index + 1,
    })),
  );
}

/** Kembalikan id kategori expense + nama, dipakai untuk validasi cepat. */
export async function categoryExists(
  db: AppDb,
  userId: string,
  categoryId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.userId, userId), eq(categories.id, categoryId)))
    .limit(1);
  return Boolean(row);
}
