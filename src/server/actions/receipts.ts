'use server';

import type { ActionResult } from '@/lib/action-types';
import { fail } from '@/lib/action-types';
import { jakartaYmd } from '@/lib/dates';
import { normalizeReceiptPayload, type ReceiptScanDraft } from '@/lib/receipt';
import { receiptScanInputSchema } from '@/lib/schemas';
import { scanReceiptWithAi } from '@/server/ai/receipt';
import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db/client';
import { listCategories } from '@/server/services/categories';
import { listWallets } from '@/server/services/wallets';
import { enforceRateLimit, errorMessage } from './shared';

/**
 * Scan foto struk → draft transaksi. Pengguna tetap harus menekan Simpan;
 * hasil AI tidak langsung masuk ledger.
 */
export async function scanReceiptAction(
  input: unknown,
): Promise<ActionResult<ReceiptScanDraft>> {
  try {
    const user = await requireUser();
    enforceRateLimit(`receipt:scan:${user.id}`, 10, 10 * 60_000);
    const values = receiptScanInputSchema.parse(input);

    const imageBase64 = values.imageBase64.replace(/\s/g, '');
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64)) {
      return fail('File gambar tidak valid. Pilih foto lain.');
    }
    const estimatedBytes = Math.floor((imageBase64.length * 3) / 4);
    if (estimatedBytes > 4_500_000) {
      return fail('Ukuran gambar maksimal 4,5 MB. Pilih foto lain atau biarkan aplikasi mengecilkannya.');
    }

    const db = await getDb();
    const [categories, wallets] = await Promise.all([
      listCategories(db, user.id, { kind: 'expense' }),
      listWallets(db, user.id),
    ]);

    const todayYmd = jakartaYmd(new Date());
    const ai = await scanReceiptWithAi({
      imageBase64,
      mimeType: values.mimeType,
      categories: categories.map((category) => category.name),
      todayYmd,
    });

    const normalized = normalizeReceiptPayload(ai.data, {
      todayYmd,
      categories: categories.map((category) => ({ id: category.id, name: category.name })),
      wallets: wallets.map((wallet) => ({
        id: wallet.id,
        name: wallet.name,
        type: wallet.type,
      })),
      provider: ai.provider,
      model: ai.model,
    });

    if (!normalized.isReceipt) {
      return fail('Gambar ini sepertinya bukan struk. Coba foto bagian struk secara penuh dan jelas.');
    }
    if (normalized.total === null) {
      return fail('Nominal total tidak terbaca. Coba foto ulang dengan pencahayaan lebih baik.');
    }

    return {
      ok: true,
      data: {
        merchant: normalized.merchant,
        dateYmd: normalized.dateYmd,
        total: normalized.total,
        categoryId: normalized.categoryId,
        categoryName: normalized.categoryName,
        walletId: normalized.walletId,
        paymentMethod: normalized.paymentMethod,
        items: normalized.items,
        note: normalized.note,
        confidence: normalized.confidence,
        warnings: normalized.warnings,
        provider: normalized.provider,
        model: normalized.model,
        rawInput: normalized.rawInput,
      },
    };
  } catch (error) {
    return fail(errorMessage(error));
  }
}
