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
- **Riwayat**: grup per hari + subtotal harian, filter (tipe/kantong/kategori/**tag**/bulan),
  pencarian (catatan, kategori, dan tag), infinite scroll, swipe/tombol untuk ubah & hapus,
  tap untuk edit.
- **Hapus dengan undo**: hapus transaksi/transfer satu tap → muncul tombol **Urungkan** di
  toast (soft delete, jadi bisa dikembalikan). Hapus kantong juga bisa diurungkan.
- **Dashboard bulan berjalan**: pemilih bulan (swipe), ringkasan masuk/keluar/selisih,
  kartu kantong + total aset, **progress budget per kategori**, donut kategori, tren harian,
  transaksi terbaru.
- **Budget bulanan per kategori** (opsional, diatur di Pengaturan): isi batas → progress bar di
  dashboard (sisa/lebih), dan tiap budget bisa **dinyalakan/dimatikan** tanpa kehilangan angkanya.
- **Laporan**: perbandingan bulan ini vs bulan lalu, tren 6 bulan, breakdown kategori, dan
  **breakdown per tag** (klik tag → riwayat terfilter).
- **Rekonsiliasi**: masukkan saldo riil → selisih dicatat sebagai adjustment.
- **Pengaturan**: tema (terang/gelap/sistem), kelola kategori, budget, arsip kantong, ekspor CSV,
  keluar, dan **hapus akun beserta seluruh data** (wajib ketik `HAPUS` untuk konfirmasi).
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

Isi `.env` (atau `.env.local`) — contoh di [.env.example](./.env.example):

```bash
DATABASE_URL=postgresql://postgres.<ref>:<password>@<region>.pooler.supabase.com:6543/postgres
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...   # atau NEXT_PUBLIC_SUPABASE_ANON_KEY gaya lama
SUPABASE_SECRET_KEY=sb_secret_...   # opsional, server-only: agar "Hapus akun" ikut menghapus user auth
```

- **Kunci**: aplikasi menerima kunci `sb_publishable_…` (gaya baru) maupun `anon` key
  (gaya lama); publishable diprioritaskan.
- **DATABASE_URL**: pakai **Direct connection** (`db.<ref>.supabase.co:5432`) untuk dev di
  komputer, atau **Supavisor transaction pooler** (port 6543) untuk deploy Vercel/serverless.
  Salin persis dari Supabase → **Connect**; nilai yang masih mengandung `<`/`>` (placeholder)
  akan diabaikan dengan peringatan.
- Gunakan kunci **secret** (`sb_secret_…`)/service role **hanya** di server dan jangan pernah
  ditulis dengan awalan `NEXT_PUBLIC_`. `SUPABASE_SECRET_KEY` (atau `SUPABASE_SERVICE_ROLE_KEY`)
  hanya dipakai fitur **Hapus akun**; tanpa kunci itu, hapus akun tetap menghapus seluruh data
  keuangan, hanya user auth-nya yang tersisa (bisa dihapus manual dari Supabase → Authentication).

Yang terjadi ketika env terisi:

- Database pindah ke Postgres Supabase (gunakan connection string **Supavisor transaction
  pooler**, port 6543 — driver sudah memakai `prepare: false`).
- Auth aktif: **email + password** (masuk & daftar langsung dari halaman `/login`, tanpa
  perlu kirim/kirim ulang email) dan **Google OAuth** opsional (`@supabase/ssr`); middleware
  melindungi halaman aplikasi.
- **RLS** ikut terpasang dari migrasi yang sama: `drizzle/0001_rls.sql` mengaktifkan policy
  `user_id = auth.uid()` pada tabel inti (`drizzle/0003_budgets.sql` melakukan hal yang sama
  untuk `budgets`) + grant untuk role `authenticated` (blok ini otomatis di-skip di PGlite/lokal).

Terapkan skema ke Supabase (sekali, dari mesin lokal):

```bash
npm run db:migrate
```

Skrip CLI (migrate/seed/drizzle-kit) otomatis memuat `.env`/`.env.local`, jadi cukup
menempelkan `DATABASE_URL` di file env — tidak perlu export manual.

### Menyiapkan login di dashboard Supabase

1. **Email + password (utama).** Authentication → **Sign In / Providers → Email**:
   - Nyalakan **Enable email provider**.
   - Matikan **Confirm email** → pendaftaran lewat tab “Daftar” langsung aktif tanpa
     verifikasi email (disarankan untuk aplikasi pribadi).
   - Jika “Confirm email” dibiarkan aktif, akun baru harus dikonfirmasi lewat email dulu
     (aplikasi akan menampilkan petunjuk ini).
   - Tombol mata di kolom password untuk melihat password yang sedang diketik.
   - **Lupa password**: tautan “Lupa password?” mengirim email reset dari Supabase; tautannya
     mendarat di `/reset-password` untuk membuat password baru (butuh halaman
     *Reset password* aktif — bawaan sudah aktif). Buka tautan di browser yang sama.
2. **Redirect URL.** Authentication → **URL Configuration → Redirect URLs**, tambahkan:
   - `http://localhost:3000/auth/callback`
   - `http://localhost:3001/auth/callback` (dev sering pindah port bila 3000 terpakai)
   - `http://<IP-komputer>:3001/auth/callback` untuk uji dari HP di Wi-Fi yang sama
   - `https://<domain-produksi>/auth/callback` saat deploy
3. **Google (opsional).** Authentication → Providers → **Google**: aktifkan, lalu isi
   Client ID/Secret dari [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   (buat OAuth Client ID tipe *Web application*, dan tempel
   `https://<ref>.supabase.co/auth/v1/callback` sebagai Authorized redirect URI).
   Tombol “Lanjutkan dengan Google” hanya muncul di halaman login **setelah** provider ini aktif.

Password yang lupa direset dari Supabase → Authentication → Users (pilih user → *Reset password*).

### Jika `npm run db:migrate` gagal

| Gejala | Penyebab & solusi |
| --- | --- |
| `password authentication failed for user "postgres"` | Password DB di `DATABASE_URL` salah. Reset di Project Settings → Database → **Reset database password**, lalu salin Connection string terbaru. |
| `tenant/user postgres.<ref> not found` | Host pooler salah region. Ambil persis dari Supabase → Connect (mis. `aws-0-<region>.pooler.supabase.com`). |
| `DATABASE_URL masih berisi placeholder` | Ganti `<ref>`/`<region>`/`<password>` dengan nilai asli; selama placeholder, aplikasi memakai PGlite. |
| IPv6 tidak tersedia (jaringan kantor) | Direct connection butuh IPv6. Pakai **Session/Transaction pooler** (IPv4) untuk dev. |

Untuk uji login dari HP di jaringan lokal, tambahkan juga `http://<IP-komputer>:3000/auth/callback`
(atau port lain yang dipakai, mis. 3001) ke daftar redirect Supabase.

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
| `npm run commit:auto` | **Pratinjau** rencana commit otomatis (dry-run) — tidak ada commit yang dibuat. |
| `npm run autocommit` | Buat commit otomatis sesuai rencana (setara `commit:auto -- --apply`). |

### Auto commit (opsional)

Skrip [scripts/auto-commit.mjs](./scripts/auto-commit.mjs) membaca perubahan di working tree,
mengelompokkannya per **tipe + scope** (`feat(web)`, `fix(db)`, …), lalu menyusun pesan
**Conventional Commits** berbahasa Indonesia.

```bash
npm run commit:auto                      # lihat rencana (dry-run)
npm run commit:auto -- --apply           # buat commit-nya
npm run commit:auto -- --staged          # hanya berkas yang sudah di-stage
npm run commit:auto -- --json            # keluaran JSON untuk tooling lain
npm run commit:auto -- --apply --co-author=copilot   # tambah trailer Co-authored-by
npm run commit:auto -- --ai              # subjek ditulis Claude (butuh ANTHROPIC_API_KEY)
```

Cara kerja:

- **Tipe** ditentukan dari status berkas + isi diff (berkas baru → `feat`, tes → `test`,
  dokumentasi → `docs`, konfigurasi → `build`/`chore`, dst.).
- **Scope** diambil dari daftar `workspaces` di `package.json` (di proyek ini tanpa workspace,
  jadi scope dikosongkan).
- **Berkas rahasia dilewati otomatis** (`.env*`, `*.pem`, `*.key`, `id_rsa`, `credentials`).
- Tes yang se-scope digabung ke commit fitur/refactor-nya agar riwayat lebih rapi.
- Perilaku bisa diubah lewat **`.commitrc.json`** di root (mis. `rules`, `overrides`,
  `mergeTestsIntoFeature`).
- Mode `--ai` hanya mengganti teks subjek; pengelompokan tetap deterministik, dan bila API
  gagal (atau `ANTHROPIC_API_KEY` kosong) subjek deterministik dipakai sebagai fallback.

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
  Hapus bisa diurungkan (`restoreTransactions` mengosongkan `deleted_at` untuk baris satu group).
- **Budget** hanya boleh menempel ke kategori pengeluaran milik user sendiri (dijaga di service
  layer, bukan hanya di UI); progress dihitung dari ledger bulan berjalan.
- **Zona waktu**: batas bulan & tren harian dihitung WIB di SQL
  (`occurred_at + 7 jam` → hari WIB), bukan zona server.
- **RLS** sebagai backstop di Supabase; service layer juga selalu memfilter `user_id`.

## Deploy (Vercel + Supabase)

1. Buat project Supabase → jalankan `npm run db:migrate` dengan `DATABASE_URL` project tsb.
2. Import repo ke Vercel, set env: `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (atau `NEXT_PUBLIC_SUPABASE_ANON_KEY`), dan
   `SUPABASE_SECRET_KEY` bila ingin fitur hapus akun ikut menghapus user auth.
   - **Wajib pakai Transaction pooler** (Supabase → Connect → *Transaction pooler*, port
     **6543**, host `aws-0-<region>.pooler.supabase.com`). Koneksi *direct*
     (`db.<ref>.supabase.co`) hanya IPv6 dan **tidak bisa dijangkau dari Vercel**.
   - Jangan biarkan placeholder `<ref>`/`<region>`: aplikasi akan menolak memakai PGlite di
     serverless dan menulis pesan jelas di log Vercel.
3. Build command default (`npm run build`). Setelah live, buka domain → login (email+password)
   → tambahkan URL `/auth/callback` ke daftar redirect Supabase.
4. **Diagnosa cepat**: buka `https://<domain>/api/health` → harus `{ "ok": true, "mode": "postgres" }`.
   Jika `false`, isinya menunjukkan sebabnya (`databaseUrl: "missing"`/`"placeholder"` atau
   `errorCode` dari Postgres seperti `28P01` untuk password salah).
5. Buka di HP → browser menawarkan "Add to Home screen" (PWA installable).

## Fase 2 (belum dibangun)

Telegram/WhatsApp ingestion: tabel `channel_links` & `ingest_events`, webhook
`/api/webhooks/telegram`, parser bertingkat + konfirmasi draft. Schema `transactions` sudah
menyiapkan kolom `source`, `raw_input`, dan `status` untuk itu.
