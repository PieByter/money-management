/**
 * Helper scan struk yang aman dipakai di client maupun server:
 * normalisasi nominal/tanggal, pencocokan kategori & kantong, dan skema JSON
 * yang diminta ke model vision.
 */

import { MAX_AMOUNT } from './money';

export const RECEIPT_AI_PROVIDERS = ['gemini', 'openrouter', 'ollama'] as const;
export type ReceiptAiProvider = (typeof RECEIPT_AI_PROVIDERS)[number];

export type ReceiptConfidence = 'high' | 'medium' | 'low';

export interface ReceiptItemDraft {
  name: string;
  /** Harga total baris (bukan harga satuan). */
  amount: number;
  /** Jumlah × 1000, mis. 1 buah = 1000, 0,5 kg = 500. */
  qtyMilli: number;
}

export interface ReceiptScanDraft {
  merchant: string | null;
  dateYmd: string | null;
  total: number;
  categoryId: string | null;
  categoryName: string | null;
  walletId: string | null;
  paymentMethod: string | null;
  items: ReceiptItemDraft[];
  note: string;
  confidence: ReceiptConfidence | null;
  warnings: string[];
  provider: ReceiptAiProvider;
  model: string;
  /** Metadata untuk kolom transactions.raw_input (tanpa menyimpan foto). */
  rawInput: string;
}

export interface CategoryLike {
  id: string;
  name: string;
}

export interface WalletLike {
  id: string;
  name: string;
  type: string;
}

export interface NormalizeReceiptOptions {
  todayYmd: string;
  categories: CategoryLike[];
  wallets: WalletLike[];
  provider: ReceiptAiProvider;
  model: string;
  /** Untuk tes; default new Date(). */
  now?: Date;
}

/**
 * Skema yang dikirim ke Gemini/Ollama. Semua field wajib supaya model tidak
 * menghilangkan kunci; nilai yang tidak terbaca diisi string kosong / 0.
 */
export const RECEIPT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    is_receipt: {
      type: 'boolean',
      description: 'true hanya jika gambar benar-benar struk, bon, invoice, atau bukti pembayaran.',
    },
    merchant: {
      type: 'string',
      description: 'Nama toko/restoran/merchant. String kosong jika tidak terbaca.',
    },
    date: {
      type: 'string',
      description: 'Tanggal transaksi format YYYY-MM-DD. String kosong jika tidak terbaca.',
    },
    total: {
      type: 'integer',
      description:
        'Jumlah akhir yang dibayar dalam rupiah (grand total, setelah diskon/pajak/service). 0 jika tidak terbaca.',
    },
    category: {
      type: 'string',
      description:
        'Pilih PERSIS salah satu nama kategori pengeluaran yang diberikan. String kosong jika tidak yakin.',
    },
    payment_method: {
      type: 'string',
      description: 'Metode pembayaran yang terlihat (cash, QRIS, GoPay, BCA, kartu, dll). String kosong jika tidak ada.',
    },
    items: {
      type: 'array',
      description: 'Daftar barang yang dibeli. Kosongkan jika tidak terbaca.',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nama barang.' },
          qty: { type: 'number', description: 'Jumlah, default 1.' },
          amount: {
            type: 'integer',
            description: 'Harga total untuk baris ini (qty × harga satuan), bukan harga satuan.',
          },
        },
        required: ['name', 'qty', 'amount'],
      },
    },
    confidence: {
      type: 'string',
      enum: ['high', 'medium', 'low'],
      description: 'Tingkat keyakinan hasil pembacaan.',
    },
    warnings: {
      type: 'array',
      description: 'Catatan singkat bila ada bagian struk yang buram/tidak terbaca.',
      items: { type: 'string' },
    },
  },
  required: [
    'is_receipt',
    'merchant',
    'date',
    'total',
    'category',
    'payment_method',
    'items',
    'confidence',
    'warnings',
  ],
} as const;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Ambil objek JSON dari teks model, termasuk yang dibungkus ```json. */
export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return JSON.parse(withoutFence);
  } catch {
    // Model kadang menambahkan kalimat sebelum/sesudah JSON.
    const start = withoutFence.indexOf('{');
    const end = withoutFence.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(withoutFence.slice(start, end + 1));
      } catch {
        // jatuh ke error di bawah
      }
    }
  }
  throw new Error('AI tidak mengembalikan JSON yang valid. Coba foto ulang.');
}

/**
 * "Rp 25.000", "25.000,00", "25000" → 25000 (integer rupiah).
 * Nilai <= 0 / tidak valid → null.
 */
export function parseIdrAmount(value: unknown): number | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    const rounded = Math.round(value);
    return rounded > 0 && rounded <= MAX_AMOUNT ? rounded : null;
  }
  if (typeof value !== 'string') return null;

  const raw = value.trim();
  if (!raw || /^-/.test(raw) || /^\(.*\)$/.test(raw)) return null;

  const digits = raw.replace(/[^\d.,]/g, '');
  if (!digits) return null;

  // Jika ada separator terakhir yang diikuti 1-2 digit, itu bagian desimal
  // (mis. "25.000,00" atau "25000.00"). IDR tidak memakai desimal.
  const lastDot = digits.lastIndexOf('.');
  const lastComma = digits.lastIndexOf(',');
  const lastSeparator = Math.max(lastDot, lastComma);

  let integerPart = digits;
  if (lastSeparator >= 0) {
    const fraction = digits.slice(lastSeparator + 1);
    if (/^\d{1,2}$/.test(fraction)) integerPart = digits.slice(0, lastSeparator);
  }

  const cleaned = integerPart.replace(/[.,]/g, '');
  if (!/^\d+$/.test(cleaned)) return null;

  const amount = Number(cleaned);
  return Number.isSafeInteger(amount) && amount > 0 && amount <= MAX_AMOUNT ? amount : null;
}

const MONTH_NAMES: Record<string, number> = {
  jan: 1,
  januari: 1,
  january: 1,
  feb: 2,
  februari: 2,
  february: 2,
  mar: 3,
  maret: 3,
  march: 3,
  apr: 4,
  april: 4,
  mei: 5,
  may: 5,
  jun: 6,
  juni: 6,
  june: 6,
  jul: 7,
  juli: 7,
  july: 7,
  agu: 8,
  agt: 8,
  agustus: 8,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  okt: 10,
  oktober: 10,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  des: 12,
  desember: 12,
  dec: 12,
  december: 12,
};

function isValidYmd(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 2000 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function ymd(year: number, month: number, day: number): string | null {
  if (!isValidYmd(year, month, day)) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function resolveYearlessDate(
  year: number | null,
  month: number,
  day: number,
  todayYmd: string,
): string | null {
  if (year !== null) return ymd(year, month, day);

  const todayYear = Number(todayYmd.slice(0, 4));
  const candidate = ymd(todayYear, month, day);
  if (!candidate) return null;

  // Struk tidak mungkin bertanggal jauh di masa depan. Jika tanpa tahun dan
  // hasilnya "masa depan", kemungkinan struk dari tahun lalu (mis. Desember).
  const today = todayYmd;
  const futureLimit = new Date(`${today}T00:00:00Z`);
  futureLimit.setUTCDate(futureLimit.getUTCDate() + 31);
  const limit = futureLimit.toISOString().slice(0, 10);

  if (candidate > limit) return ymd(todayYear - 1, month, day);
  return candidate;
}

function normalizeTwoDigitYear(value: number): number {
  if (value >= 100) return value;
  return value >= 70 ? 1900 + value : 2000 + value;
}

/**
 * Tanggal struk → YYYY-MM-DD. Mendukung format Indonesia (DD/MM/YYYY),
 * nama bulan (5 Nov 2026), dan ISO. Tahun boleh kosong.
 */
export function normalizeReceiptDate(value: unknown, todayYmd: string): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(/\s+/g, ' ');
  if (!text) return null;

  // ISO 8601 (termasuk yang membawa jam).
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/);
  if (iso) {
    const result = ymd(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    if (result) return result;
  }

  // 05/11/2026, 5-11-26, 2026/11/05.
  const numeric = text.match(/^(\d{1,2})[/.\-](\d{1,2})(?:[/.\-](\d{2,4}))?$/);
  if (numeric) {
    const first = Number(numeric[1]);
    const second = Number(numeric[2]);
    const rawYear = numeric[3] ? Number(numeric[3]) : null;
    const year = rawYear === null ? null : normalizeTwoDigitYear(rawYear);

    // Prioritaskan DD/MM (kebiasaan Indonesia). Jika tidak valid, coba MM/DD.
    const dmy = resolveYearlessDate(year, second, first, todayYmd);
    if (dmy) return dmy;
    return resolveYearlessDate(year, first, second, todayYmd);
  }

  // 5 November 2026 / 5 Nov / November 5, 2026.
  const dayFirst = text.match(/^(\d{1,2})\s+([A-Za-z]+)(?:\s+(\d{2,4}))?$/);
  if (dayFirst) {
    const month = MONTH_NAMES[dayFirst[2].toLowerCase()];
    if (!month) return null;
    const year = dayFirst[3] ? normalizeTwoDigitYear(Number(dayFirst[3])) : null;
    return resolveYearlessDate(year, month, Number(dayFirst[1]), todayYmd);
  }

  const monthFirst = text.match(/^([A-Za-z]+)\s+(\d{1,2})(?:,\s*|\s+)(\d{2,4})$/);
  if (monthFirst) {
    const month = MONTH_NAMES[monthFirst[1].toLowerCase()];
    if (!month) return null;
    return resolveYearlessDate(
      normalizeTwoDigitYear(Number(monthFirst[3])),
      month,
      Number(monthFirst[2]),
      todayYmd,
    );
  }

  return null;
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Alias umum isi struk → kata kunci nama kategori bawaan aplikasi. */
const CATEGORY_ALIASES: { target: string; keywords: string[] }[] = [
  {
    target: 'makan',
    keywords: [
      'makan', 'makanan', 'minum', 'minuman', 'resto', 'restoran', 'warung', 'cafe', 'kafe',
      'kopi', 'bakso', 'nasi', 'ayam', 'pizza', 'burger', 'food', 'snack', 'jajan', 'kue',
    ],
  },
  {
    target: 'belanja',
    keywords: [
      'belanja', 'supermarket', 'minimarket', 'indomaret', 'alfamart', 'alfamidi', 'hypermart',
      'grocery', 'groceries', 'sayur', 'buah', 'laundry', 'toko', 'mart',
    ],
  },
  {
    target: 'transport',
    keywords: [
      'transport', 'bensin', 'pertalite', 'pertamax', 'solar', 'spbu', 'parkir', 'tol', 'ojek',
      'grab', 'gojek', 'taksi', 'taxi', 'bus', 'kereta', 'mrt', 'lrt', 'tiket', 'travel',
    ],
  },
  {
    target: 'tagihan',
    keywords: [
      'tagihan', 'listrik', 'pln', 'air', 'pdam', 'internet', 'wifi', 'pulsa', 'token',
      'telkom', 'indihome', 'bpjs', 'asuransi', 'cicilan', 'iuran',
    ],
  },
  {
    target: 'kesehatan',
    keywords: ['kesehatan', 'apotek', 'apotik', 'obat', 'klinik', 'rumah sakit', 'dokter', 'medis', 'vitamin'],
  },
  {
    target: 'hiburan',
    keywords: ['hiburan', 'bioskop', 'cinema', 'nonton', 'game', 'steam', 'netflix', 'spotify', 'konser', 'wisata', 'rekreasi'],
  },
  {
    target: 'pendidikan',
    keywords: ['pendidikan', 'buku', 'kursus', 'sekolah', 'kuliah', 'kampus', 'udemy', 'course', 'les'],
  },
  {
    target: 'biaya admin',
    keywords: ['admin', 'biaya admin', 'fee', 'transfer', 'bank'],
  },
];

/** Cocokkan teks kategori dari AI dengan kategori milik user. */
export function matchCategory(
  name: string | null,
  categories: CategoryLike[],
): CategoryLike | null {
  if (!name || categories.length === 0) return null;
  const needle = normalizeText(name);
  if (!needle) return null;

  const exact = categories.find((category) => normalizeText(category.name) === needle);
  if (exact) return exact;

  const contains = categories.find((category) => {
    const candidate = normalizeText(category.name);
    return candidate.length >= 3 && (needle.includes(candidate) || candidate.includes(needle));
  });
  if (contains) return contains;

  for (const alias of CATEGORY_ALIASES) {
    if (!alias.keywords.some((keyword) => needle.includes(keyword))) continue;
    const matched = categories.find((category) =>
      normalizeText(category.name).includes(alias.target),
    );
    if (matched) return matched;
  }

  return null;
}

/**
 * Cocokkan metode pembayaran di struk dengan nama kantong user.
 * "GoPay" → kantong GoPay; "tunai/cash" → kantong bertipe cash.
 */
export function matchWallet(
  paymentMethod: string | null,
  wallets: WalletLike[],
): WalletLike | null {
  if (!paymentMethod || wallets.length === 0) return null;
  const needle = normalizeText(paymentMethod);
  if (!needle) return null;

  const byName = wallets
    .filter((wallet) => {
      const candidate = normalizeText(wallet.name);
      return candidate.length >= 2 && (needle.includes(candidate) || candidate.includes(needle));
    })
    .sort((a, b) => b.name.length - a.name.length)[0];
  if (byName) return byName;

  const wantsCash = /\b(cash|tunai|uang tunai)\b/.test(needle);
  if (wantsCash) return wallets.find((wallet) => wallet.type === 'cash') ?? null;

  return null;
}

function toText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (/^(true|ya|yes|1)$/i.test(value.trim())) return true;
    if (/^(false|tidak|no|0)$/i.test(value.trim())) return false;
  }
  return fallback;
}

function toConfidence(value: unknown): ReceiptConfidence | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized === 'high' || normalized === 'medium' || normalized === 'low'
    ? normalized
    : null;
}

function normalizeQtyMilli(value: unknown): number {
  const raw = typeof value === 'number' ? value : Number(String(value ?? '').replace(',', '.'));
  if (!Number.isFinite(raw) || raw <= 0) return 1000;
  return Math.min(1_000_000, Math.max(1, Math.round(raw * 1000)));
}

function normalizeItems(
  value: unknown,
  total: number | null,
  warnings: string[],
): ReceiptItemDraft[] {
  if (!Array.isArray(value)) return [];

  const items: ReceiptItemDraft[] = [];
  for (const entry of value.slice(0, 60)) {
    if (!isRecord(entry)) continue;
    const name = toText(entry.name ?? entry.item ?? entry.description, 60);
    const amount = parseIdrAmount(entry.amount ?? entry.price ?? entry.total);
    if (!name || amount === null) continue;
    items.push({
      name,
      amount,
      qtyMilli: normalizeQtyMilli(entry.qty ?? entry.quantity ?? 1),
    });
  }

  if (items.length === 0) return [];
  if (total !== null) {
    const sum = items.reduce((totalItems, item) => totalItems + item.amount, 0);
    if (sum > total) {
      warnings.push('Rincian item diabaikan karena totalnya melebihi nominal struk.');
      return [];
    }
  }
  return items;
}

function cleanWarnings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim().slice(0, 200) : ''))
    .filter(Boolean)
    .slice(0, 5);
}

function buildRawInput(input: {
  provider: ReceiptAiProvider;
  model: string;
  isReceipt: boolean;
  merchant: string | null;
  dateYmd: string | null;
  total: number | null;
  categoryName: string | null;
  categoryId: string | null;
  paymentMethod: string | null;
  confidence: ReceiptConfidence | null;
  items: ReceiptItemDraft[];
  warnings: string[];
  now: Date;
}): string {
  const base = {
    v: 1,
    provider: input.provider,
    model: input.model,
    isReceipt: input.isReceipt,
    merchant: input.merchant,
    date: input.dateYmd,
    total: input.total,
    category: input.categoryName,
    categoryId: input.categoryId,
    paymentMethod: input.paymentMethod,
    confidence: input.confidence,
    warnings: input.warnings,
    scannedAt: input.now.toISOString(),
  };

  let items = input.items.slice(0, 20);
  let json = JSON.stringify({ ...base, items });
  if (json.length > 3500) {
    items = items.slice(0, 5);
    json = JSON.stringify({ ...base, items });
  }
  if (json.length > 3500) json = JSON.stringify({ ...base, items: [] });
  return json;
}

/**
 * Ubah output mentah AI menjadi draft yang siap mengisi form transaksi.
 * Tidak menyimpan foto; hanya metadata yang aman untuk audit.
 */
export function normalizeReceiptPayload(
  payload: unknown,
  options: NormalizeReceiptOptions,
): Omit<ReceiptScanDraft, 'total'> & { isReceipt: boolean; total: number | null } {
  const record = isRecord(payload) ? payload : {};
  const warnings = cleanWarnings(record.warnings ?? record.warning);

  const total = parseIdrAmount(record.total ?? record.grand_total ?? record.grandTotal ?? record.amount);
  const isReceipt = toBoolean(record.is_receipt ?? record.isReceipt, total !== null);

  const merchant = toText(record.merchant ?? record.store ?? record.vendor, 120);
  const dateRaw = toText(record.date ?? record.transaction_date ?? record.transactionDate, 40);
  const dateYmd = normalizeReceiptDate(dateRaw, options.todayYmd);
  const paymentMethod = toText(record.payment_method ?? record.paymentMethod ?? record.payment, 40);
  const confidence = toConfidence(record.confidence);

  const aiCategoryName = toText(record.category ?? record.category_name ?? record.categoryName, 60);
  const category = matchCategory(aiCategoryName, options.categories);
  const wallet = matchWallet(paymentMethod, options.wallets);
  const items = normalizeItems(record.items ?? record.line_items ?? record.lineItems, total, warnings);

  if (!dateYmd) {
    warnings.push('Tanggal struk tidak terbaca — periksa tanggal sebelum menyimpan.');
  }
  if (total === null) {
    warnings.push('Nominal total tidak terbaca dari struk.');
  }
  if (!category) {
    warnings.push('Kategori belum pasti — pilih manual.');
  }
  if (confidence === 'low') {
    warnings.push('Keyakinan AI rendah — periksa nominal dan item.');
  }
  if (!isReceipt) {
    warnings.push('Gambar ini tampaknya bukan struk.');
  }

  const uniqueWarnings = [...new Set(warnings)].slice(0, 6);
  const note = (merchant ? `Struk ${merchant}` : 'Struk (scan AI)').slice(0, 280);

  return {
    isReceipt,
    merchant,
    dateYmd,
    total,
    categoryId: category?.id ?? null,
    categoryName: category?.name ?? aiCategoryName,
    walletId: wallet?.id ?? null,
    paymentMethod,
    items,
    note,
    confidence,
    warnings: uniqueWarnings,
    provider: options.provider,
    model: options.model,
    rawInput: buildRawInput({
      provider: options.provider,
      model: options.model,
      isReceipt,
      merchant,
      dateYmd,
      total,
      categoryName: category?.name ?? aiCategoryName,
      categoryId: category?.id ?? null,
      paymentMethod,
      confidence,
      items,
      warnings: uniqueWarnings,
      now: options.now ?? new Date(),
    }),
  };
}
