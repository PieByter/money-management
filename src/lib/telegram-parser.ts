/**
 * Parser deterministik untuk pesan chat (Telegram/WhatsApp).
 * Contoh yang didukung:
 *   makan siang 25rb gopay
 *   +5jt gaji bca
 *   tf bca>cash 500rb
 *   transfer dari Bank Jago ke Dana 100.000
 *
 * Parser tidak menyentuh database; pemanggil menyiapkan daftar kantong dan
 * kategori milik user. Bila nominal/kantong tidak yakin, hasilnya gagal dan
 * webhook membalas petunjuk — tidak ada transaksi "asal masuk".
 */

export interface ParserWallet {
  id: string;
  name: string;
}

export interface ParserCategory {
  id: string;
  name: string;
  kind: 'income' | 'expense';
}

export interface ParseContext {
  wallets: ParserWallet[];
  categories: ParserCategory[];
  lastWalletId?: string | null;
}

export interface ParsedSimple {
  ok: true;
  kind: 'income' | 'expense';
  amount: number;
  walletId: string;
  walletName: string;
  categoryId: string | null;
  categoryName: string | null;
  note: string | null;
  usedLastWallet: boolean;
}

export interface ParsedTransfer {
  ok: true;
  kind: 'transfer';
  amount: number;
  fromWalletId: string;
  fromWalletName: string;
  toWalletId: string;
  toWalletName: string;
  note: string | null;
}

export type ParsedMessage = ParsedSimple | ParsedTransfer;

export interface ParseFailure {
  ok: false;
  reason: string;
}

export type ParseOutcome = ParsedMessage | ParseFailure;

const STOPWORDS = new Set([
  'bank',
  'kartu',
  'dompet',
  'uang',
  'digital',
  'emoney',
  'e-money',
  'e wallet',
  'ewallet',
  'rekening',
  'tabungan',
]);

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasMention(text: string, name: string): boolean {
  const normalizedName = normalize(name);
  if (!normalizedName) return false;
  return new RegExp(`(^|\\s)${escapeRegExp(normalizedName)}($|\\s)`).test(text);
}

function mentions(name: string): string[] {
  const normalizedName = normalize(name);
  const words = normalizedName.split(' ').filter((word) => word.length >= 3 && !STOPWORDS.has(word));
  return [normalizedName, ...words].filter(Boolean);
}

function findBestMatch<T extends { name: string }>(
  text: string,
  items: T[],
): { item: T; mention: string } | null {
  let best: { item: T; mention: string } | null = null;
  for (const item of items) {
    for (const mention of mentions(item.name)) {
      if (!hasMention(text, mention)) continue;
      if (!best || mention.length > best.mention.length) best = { item, mention };
    }
  }
  return best;
}

function parseNumeric(raw: string): number {
  const clean = raw.replace(/[^\d.,]/g, '');
  if (!clean) return 0;
  const separators = (clean.match(/[.,]/g) ?? []).length;
  if (separators === 0) return Number(clean);
  const lastSeparator = Math.max(clean.lastIndexOf('.'), clean.lastIndexOf(','));
  const decimals = clean.length - lastSeparator - 1;
  if (separators === 1 && decimals > 0 && decimals <= 2) {
    return Number(clean.replace(',', '.'));
  }
  return Number(clean.replace(/[.,]/g, ''));
}

const AMOUNT_RE =
  /(?:rp\.?\s*)?(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s*(jt|juta|rb|ribu|k|m)?\b/gi;

function findAmount(text: string): { amount: number; raw: string; index: number } | null {
  let match: RegExpExecArray | null;
  let best: { amount: number; raw: string; index: number } | null = null;
  AMOUNT_RE.lastIndex = 0;
  while ((match = AMOUNT_RE.exec(text)) !== null) {
    // Lewati potongan tanggal/jam (mis. 2026-10-05 atau 12:30).
    const before = text[match.index - 1] ?? '';
    const after = text[match.index + match[0].length] ?? '';
    if (/[\d:/-]/.test(before) || /[\d:/-]/.test(after)) continue;
    const value = parseNumeric(match[1]);
    const multiplier = (match[2] ?? '').toLowerCase();
    let amount: number;
    if (multiplier === 'jt' || multiplier === 'juta' || multiplier === 'm') amount = value * 1_000_000;
    else if (multiplier === 'rb' || multiplier === 'ribu' || multiplier === 'k') amount = value * 1_000;
    else amount = value;
    amount = Math.round(amount);
    if (!Number.isSafeInteger(amount) || amount <= 0) continue;
    // Ambil nominal pertama yang valid; teks chat biasanya satu nominal.
    best = { amount, raw: match[0], index: match.index };
    break;
  }
  return best;
}

function stripNoise(
  text: string,
  opts: { amountRaw?: string; walletMention?: string },
): string | null {
  let note = text;
  if (opts.amountRaw) note = note.replace(opts.amountRaw, ' ');
  if (opts.walletMention) {
    note = note.replace(new RegExp(escapeRegExp(opts.walletMention), 'gi'), ' ');
  }
  note = note
    .replace(/^[+\-]\s*/, '')
    .replace(/\b(masuk|keluar|pengeluaran|pemasukan|transfer|tf|pindah)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return note ? note.slice(0, 280) : null;
}

const MAX_AMOUNT = 1_000_000_000_000;

function validateAmount(amount: number): string | null {
  if (!Number.isSafeInteger(amount) || amount <= 0) return 'Nominal tidak valid.';
  if (amount > MAX_AMOUNT) return 'Nominal terlalu besar.';
  return null;
}

function walletList(context: ParseContext): string {
  return context.wallets.map((wallet) => wallet.name).join(', ');
}

function parseTransfer(text: string, context: ParseContext): ParseOutcome | null {
  const normalizedText = text.toLowerCase();
  const isTransfer =
    /^\s*(tf|transfer|pindah)\b/.test(normalizedText) || /\b(tf|transfer)\b/.test(normalizedText);
  if (!isTransfer) return null;

  const amount = findAmount(text);
  if (!amount) {
    return { ok: false, reason: 'Nominal transfer tidak ditemukan. Contoh: tf bca>cash 500rb' };
  }
  const amountError = validateAmount(amount.amount);
  if (amountError) return { ok: false, reason: amountError };

  const body = text.replace(amount.raw, ' ').replace(/^\s*(tf|transfer|pindah)\s*/i, ' ');
  let fromText = '';
  let toText = '';
  if (body.includes('>')) {
    const [left, right] = body.split('>', 2);
    fromText = left ?? '';
    toText = right ?? '';
  } else {
    const match = body.match(/(.+?)\s+(?:ke|kepada)\s+(.+)/i);
    if (match) {
      fromText = match[1].replace(/\bdari\b/i, '');
      toText = match[2];
    }
  }

  if (!fromText.trim() || !toText.trim()) {
    return {
      ok: false,
      reason: 'Sebutkan kantong asal dan tujuan. Contoh: tf bca>cash 500rb',
    };
  }

  const from = findBestMatch(normalize(fromText), context.wallets);
  const to = findBestMatch(normalize(toText), context.wallets);
  if (!from || !to) {
    return {
      ok: false,
      reason: `Kantong transfer tidak dikenali. Pilih dari: ${walletList(context)}`,
    };
  }
  if (from.item.id === to.item.id) {
    return { ok: false, reason: 'Kantong asal dan tujuan tidak boleh sama.' };
  }

  return {
    ok: true,
    kind: 'transfer',
    amount: amount.amount,
    fromWalletId: from.item.id,
    fromWalletName: from.item.name,
    toWalletId: to.item.id,
    toWalletName: to.item.name,
    note: stripNoise(body, { walletMention: from.mention }) ?? null,
  };
}

export function parseChatMessage(text: string, context: ParseContext): ParseOutcome {
  const clean = text.trim();
  if (!clean) return { ok: false, reason: 'Pesan kosong.' };

  const transfer = parseTransfer(clean, context);
  if (transfer) return transfer;

  const amount = findAmount(clean);
  if (!amount) {
    return {
      ok: false,
      reason: 'Nominal tidak ditemukan. Contoh: makan siang 25rb gopay',
    };
  }
  const amountError = validateAmount(amount.amount);
  if (amountError) return { ok: false, reason: amountError };

  const normalizedText = normalize(clean);
  const incomeHint =
    /^\s*\+/.test(clean) ||
    /\b(gaji|masuk|terima|bonus|jual|pendapatan|refund|cashback|honor)\b/i.test(clean);
  const kind = incomeHint ? 'income' : 'expense';

  const walletMatch = findBestMatch(normalizedText, context.wallets);
  let walletId: string;
  let walletName: string;
  let usedLastWallet = false;
  if (walletMatch) {
    walletId = walletMatch.item.id;
    walletName = walletMatch.item.name;
  } else if (context.lastWalletId) {
    const last = context.wallets.find((wallet) => wallet.id === context.lastWalletId);
    if (!last) {
      return {
        ok: false,
        reason: `Kantong tidak dikenali. Sebutkan salah satu: ${walletList(context)}`,
      };
    }
    walletId = last.id;
    walletName = last.name;
    usedLastWallet = true;
  } else {
    return {
      ok: false,
      reason: `Kantong tidak dikenali. Sebutkan salah satu: ${walletList(context)}`,
    };
  }

  const categoryMatch = findBestMatch(
    normalizedText,
    context.categories.filter((category) => category.kind === kind),
  );

  const note = stripNoise(clean, {
    amountRaw: amount.raw,
    walletMention: walletMatch?.mention,
  });

  return {
    ok: true,
    kind,
    amount: amount.amount,
    walletId,
    walletName,
    categoryId: categoryMatch?.item.id ?? null,
    categoryName: categoryMatch?.item.name ?? null,
    note,
    usedLastWallet,
  };
}
