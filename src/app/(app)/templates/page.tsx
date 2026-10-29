import { TemplateManager } from '@/components/app/template-manager';
import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db/client';
import { listCategories } from '@/server/services/categories';
import { getFrequentItems } from '@/server/services/items';
import { listTemplates } from '@/server/services/templates';
import { listWallets } from '@/server/services/wallets';

export const metadata = { title: 'Template' };

export default async function TemplatesPage() {
  const user = await requireUser();
  const db = await getDb();

  const [templates, wallets, categories, frequentItems] = await Promise.all([
    listTemplates(db, user.id),
    listWallets(db, user.id),
    listCategories(db, user.id),
    getFrequentItems(db, user.id, 12),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Template</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Simpan transaksi yang sering diulang — mis. susu + roti Rp 15.000 tiap Senin. Pakai
          sekali tap dari tombol +, atau nyalakan jadwal agar tercatat otomatis.
        </p>
      </div>

      <TemplateManager
        templates={templates}
        wallets={wallets.map((wallet) => ({
          id: wallet.id,
          name: wallet.name,
          icon: wallet.icon,
          color: wallet.color,
          type: wallet.type,
        }))}
        categories={categories.map((category) => ({
          id: category.id,
          name: category.name,
          kind: category.kind,
          icon: category.icon,
          color: category.color,
        }))}
        frequentItems={frequentItems.map((item) => ({
          id: item.id,
          name: item.name,
          lastPrice: item.lastPrice,
        }))}
      />
    </div>
  );
}
