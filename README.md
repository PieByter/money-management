# Money Tracker

Aplikasi pencatat keuangan pribadi (mobile-first PWA) yang menjawab satu pertanyaan:
**"Bulan ini uang masuk berapa, keluar berapa, dan sekarang uangnya ada di kantong mana saja?"**

Implementasi Fase 1 dari [PRD.md](./PRD.md): input lewat form web yang cepat di HP,
dashboard bulan berjalan, saldo per kantong yang selalu benar (ledger-derived),
riwayat dengan filter, rekonsiliasi, laporan, dan ekspor CSV.

## Fitur (Fase 1)

- **Kantong** (cash/bank/e-wallet/lainnya) dengan saldo awal otomatis sebagai adjustment.
- **Transaksi**: pengeluaran, pemasukan, dan **transfer dua-leg** (bukan pemasukan/pengeluaran)
  dengan biaya admin opsional dalam satu `group_id`.
- **Bottom sheet input cepat**: segmented tipe, numpad besar (`rb` = ×1000), chip kantong &
  kategori (paling sering dipakai di depan), tanggal Hari ini/Kemarin, catatan, tag.
- **Riwayat**: grup per hari + subtotal harian, filter (tipe/kantong/kategori/bulan),
  pencarian, infinite scroll, swipe untuk ubah/hapus, tap untuk edit.
- **Dashboard bulan berjalan**: pemilih bulan (swipe), ringkasan masuk/keluar/selisih,
  kartu kantong + total aset, donut kategori, tren harian, transaksi terbaru.
- **Laporan**: perbandingan bulan ini vs bulan lalu, tren 6 bulan, breakdown kategori.
- **Rekonsiliasi**: masukkan saldo riil → selisih dicatat sebagai adjustment.
- **Pengaturan**: tema (terang/gelap/sistem), kelola kategori, arsip kantong, ekspor CSV, akun.
- **PWA**: installable + offline shell (`public/sw.js`, manifest berbasis `src/app/manifest.ts`).
- Semua perhitungan tanggal/laporan memakai zona **Asia/Jakarta (WIB)**; uang disimpan sebagai
  integer rupiah (tanpa float).

## Menjalankan lokal (tanpa setup apa pun)

Butuh Node.js ≥ 20.

```bash
npm install
npm run dev
```

Buka http://localhost:3000. Tanpa env apa pun aplikasi berjalan dalam **mode lokal satu
pengguna**: database memakai **PGlite** (Postgres embedded) di `./.data/pglite` dan migrasi
jalan otomatis saat pertama dibuka.

### Mengakses dari HP (satu jaringan Wi-Fi)

```bash
npm run dev:lan
```

Lalu buka `http://<IP-komputer>:3000` dari HP (mis. `http://192.168.1.10:3000`).
Izinkan node.exe saat Windows Firewall bertanya.

> Catatan PWA: service worker hanya aktif pada build produksi (`npm run build && npm start`)
> dan hanya di origin yang aman (HTTPS atau localhost). Lewat LAN/HTTP aplikasi tetap jalan
> penuh di browser, tetapi "Install app"/offline shell baru aktif setelah di-deploy ke HTTPS
> (mis. Vercel) — lihat bagian Deploy.

## Mode Supabase (multi-user / produksi)

Isi `.env.local` (contoh di [.env.example](./.env.example)):

```bash
DATABASE_URL=postgresql://postgres.<ref>:<password>@<region>.pooler.supabase.com:6543/postgres
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

Yang terjadi ketika env terisi:

- Database pindah ke Postgres Supabase (gunakan connection string **Supavisor transaction
  pooler**, port 6543 — driver sudah memakai `prepare: false`).
- Auth aktif: **magic link email + Google OAuth** (`@supabase/ssr`), middleware melindungi
  halaman aplikasi.
- **RLS** ikut terpasang dari migrasi yang sama: `drizzle/0001_rls.sql` mengaktifkan policy
  `user_id = auth.uid()` pada ketiga tabel + grant untuk role `authenticated` (blok ini
  otomatis di-skip di PGlite/lokal).

Terapkan skema ke Supabase (sekali, dari mesin lokal):

```bash
npm run db:migrate
```

Susun Supabase project: matikan "Confirm email" bila perlu, tambahkan URL redirect
`https://<domain-kamu>/auth/callback` pada Authentication → URL Configuration, dan aktifkan
provider Google bila dipakai.

## Skrip

| Skrip | Fungsi |
| --- | --- |
| `npm run dev` | Dev server (Turbopack). |
| `npm run dev:lan` | Dev server terikat `0.0.0.0` untuk diakses dari HP. |
| `npm run build` / `npm start` | Build & jalankan produksi. |
| `npm run lint` | ESLint. |
| `npm test` | Vitest: service layer (transfer atomik, idempotensi, batas bulan WIB, invariant saldo) + unit money/dates. |
| `npm run db:generate` | Generate migrasi Drizzle dari `src/server/db/schema.ts`. |
| `npm run db:migrate` | Jalankan migrasi ke `DATABASE_URL` (atau PGlite bila kosong). |
| `npm run db:seed` | Seed kategori default (juga otomatis dijalankan saat aplikasi pertama dibuka). |
| `npm run icons` | Regenerasi ikon PWA (`/public/icons/*`, `src/app/icon.png`, `apple-icon.png`) tanpa dependency. |

## Arsitektur singkat

```
src/
  app/                # Next.js App Router
    (app)/            # area terautentikasi: dashboard, transactions, wallets, reports, settings
    (auth)/login      # login Supabase (mode lokal auto-redirect)
    api/export        # ekspor CSV
    manifest.ts, icon.png, apple-icon.png   # PWA
  components/app/     # AppShell (bottom nav/sidebar), sheet transaksi + numpad, daftar transaksi, dll.
  server/
    db/               # schema Drizzle + client (PGlite ⇄ Postgres) + view wallet_balances
    services/         # transaksi (ledger), wallet, kategori, laporan — domain logic murni
    actions/          # Server Actions (validasi Zod + auth + revalidate)
  lib/                # money (integer), dates (WIB), zod schemas, view types
drizzle/              # migrasi SQL (dipakai lokal & Supabase; termasuk RLS)
tests/                # Vitest + PGlite in-memory
```

Keputusan penting (sesuai PRD):

- **Saldo selalu dari ledger** — SQL view `wallet_balances`; tidak ada kolom saldo yang diedit.
- **Transfer = 2 baris ledger** (`transfer_out` + `transfer_in`) dengan `group_id` sama,
  dibuat dalam satu transaksi DB; fee menjadi `expense` terpisah di group yang sama.
- **Kinds**: `income`, `expense`, `transfer_in`, `transfer_out`, `adjustment_in`, `adjustment_out`
  (amount selalu positif; tanda ditangani di view/laporan).
- **Idempotensi** semua mutasi via `client_request_id` + unique `(user_id, client_request_id)`
  — aman dari double-tap/retry jaringan.
- **Soft delete** (`deleted_at`) di semua query; edit transfer mengubah kedua leg secara atomik.
- **Zona waktu**: batas bulan & tren harian dihitung WIB di SQL
  (`occurred_at + 7 jam` → hari WIB), bukan zona server.
- **RLS** sebagai backstop di Supabase; service layer juga selalu memfilter `user_id`.

## Deploy (Vercel + Supabase)

1. Buat project Supabase → jalankan `npm run db:migrate` dengan `DATABASE_URL` project tsb.
2. Import repo ke Vercel, set env: `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. Build command default (`npm run build`). Setelah live, buka domain → login via magic link →
   tambahkan URL `/auth/callback` ke daftar redirect Supabase.
4. Buka di HP → browser menawarkan "Add to Home screen" (PWA installable).

## Fase 2 (belum dibangun)

Telegram/WhatsApp ingestion: tabel `channel_links` & `ingest_events`, webhook
`/api/webhooks/telegram`, parser bertingkat + konfirmasi draft. Schema `transactions` sudah
menyiapkan kolom `source`, `raw_input`, dan `status` untuk itu.
