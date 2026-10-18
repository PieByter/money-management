/**
 * Inspeksi sekali-pakai: duplikasi kategori/kantong & relasinya (read-only).
 * Catatan: categories & wallets memakai archived_at; transactions memakai deleted_at.
 */
import postgres from 'postgres';
import { loadEnvFiles } from './load-env';

loadEnvFiles();

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL kosong');
    process.exit(1);
  }
  const sql = postgres(url, { max: 1, prepare: false });
  try {
    const dupes = await sql<{ user_id: string; kind: string; name: string; jumlah: string }[]>`
      select user_id, kind, name, count(*)::text as jumlah
      from categories
      where archived_at is null
      group by user_id, kind, name
      having count(*) > 1
      order by 4 desc`;
    console.log('[cek] grup kategori duplikat:', dupes.length);
    for (const d of dupes.slice(0, 15)) console.log(`  - ${d.kind} "${d.name}" x${d.jumlah}`);

    const [catCount] = await sql<{ total: string }[]>`
      select count(*)::text as total from categories where archived_at is null`;
    const [walletCount] = await sql<{ total: string }[]>`
      select count(*)::text as total from wallets where archived_at is null`;
    const [txCount] = await sql<{ total: string }[]>`
      select count(*)::text as total from transactions where deleted_at is null`;
    console.log(
      `[cek] total kategori=${catCount.total} kantong=${walletCount.total} transaksi=${txCount.total}`,
    );

    const used = await sql<{ name: string; jumlah: string }[]>`
      select c.name, count(t.id)::text as jumlah
      from categories c
      left join transactions t on t.category_id = c.id and t.deleted_at is null
      where c.archived_at is null
      group by c.id, c.name
      having count(t.id) > 0
      order by 2 desc
      limit 10`;
    console.log(
      '[cek] kategori terpakai transaksi:',
      used.length ? used.map((o) => `${o.name}=${o.jumlah}`).join(', ') : '(belum ada)',
    );

    const wallets = await sql<{ name: string; type: string }[]>`
      select name, type from wallets where archived_at is null order by sort_order`;
    console.log(
      '[cek] kantong:',
      wallets.length ? wallets.map((w) => `${w.name}(${w.type})`).join(', ') : '(kosong)',
    );
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
