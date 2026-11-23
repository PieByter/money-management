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
  kategori (paling sering dipakai di depan), **date picker kalender** (hari ini/kemarin atau
  ketuk tanggal di kalender — tanpa mengetik), catatan, tag.
- **Scan struk AI (opsional, gratis)**: foto struk → AI membaca merchant, tanggal, total,
  rincian item, dan kategori → form pengeluaran langsung terisi sebagai **draft**. Pengguna
  tetap memeriksa dan menekan Simpan; tidak ada transaksi yang masuk otomatis tanpa konfirmasi.
  Bisa memakai Gemini free tier, OpenRouter model `:free`, atau Ollama lokal. Foto tidak
  disimpan di database — hanya ringkasan hasil ekstraksi di `raw_input`.
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
- **Rincian item (mode belanja)**: untuk transaksi pengeluaran bisa dicatat barang satu per satu
  (nama, jumlah, harga) — dihitung bebas AI. Total rincian tidak boleh melebihi nominal, dan
  selisih yang belum dirinci boleh dibiarkan. Item katalog terbentuk otomatis dari nama barang.
- **Item & harga** (Pengaturan → Item & harga): katalog barang yang pernah dibeli, berapa kali
  dibeli, harga terakhir, plus grafik riwayat harga satuan (terendah/tertinggi/perubahan).
- **Hutang & piutang**: catat pinjaman lengkap dengan **dari/ke siapa**, **untuk apa**, kantong
  sumber dana (mis. Bank Jago) dan kantong pembayaran (mis. Dana), jatuh tempo, serta angsuran.
  Uang pinjaman langsung masuk/keluar kantong saat dicatat, dan tombol **Lunas** memposting sisa
  ke saldo kantong dalam satu tap. Halaman detail menampilkan **alur uang** (dana masuk → tiap
  pembayaran) dan sisa selalu dihitung dari ledger.
- **Template transaksi**: simpan "resep" transaksi yang sering diulang (mis. **susu + roti
  Rp 15.000 tiap Senin**) lengkap dengan kantong, kategori, catatan, tag, dan rincian item.
  Template muncul sebagai chip di form input (sekali tap = form terisi) dan bisa diberi
  **jadwal otomatis** (harian/mingguan/bulanan) — transaksi yang jatuh tempo langsung dicatat
  saat aplikasi dibuka, dengan tanggal sesuai jadwal walau kamu telat membuka aplikasi.
- **Laporan**: perbandingan bulan ini vs bulan lalu, tren 6 bulan, breakdown kategori, dan
  **breakdown per tag** (klik tag → riwayat terfilter).
- **Rekonsiliasi**: masukkan saldo riil → selisih dicatat sebagai adjustment.
- **Pengaturan**: tema (terang/gelap/sistem), kelola kategori, budget, arsip kantong, ekspor CSV,
  keluar, dan **hapus akun beserta seluruh data** (wajib ketik `HAPUS` untuk konfirmasi).
- **Kekayaan bersih & arus kas operasional**: kartu net worth (aset + piutang − utang) dan
  toggle **Semua / Operasional** agar pencairan & pelunasan pinjaman tidak menggelembungkan
  laporan belanja.
- **Akan datang**: template terjadwal, jatuh tempo pinjaman, dan tagihan kartu kredit dalam
  14 hari. Template juga diposting oleh cron harian `/api/cron/templates` (tidak bergantung
  pada aplikasi dibuka).
- **Budget total bulanan**: pagu di luar pinjaman + angka **sisa aman per hari**; budget per
  kategori tetap tersedia.
- **Tujuan tabungan**: target dana darurat/liburan dengan progres dari saldo kantong khusus,
  perkiraan sisipan per bulan, dan otomatis menolak kartu kredit sebagai kantong tujuan.
- **Antrean offline**: transaksi baru disimpan di IndexedDB saat sinyal buruk, lalu dikirim
  otomatis saat online dengan `client_request_id` (tanpa duplikat).
- **Import CSV & backup JSON**: impor transaksi dengan pratinjau (kantong/kategori baru dibuat
  otomatis), ekspor backup seluruh data, dan restore yang mengganti data setelah konfirmasi.
- **Telegram bot**: tautkan chat lewat token di Pengaturan, lalu catat dengan
  `makan siang 25rb gopay`, `+5jt gaji bca`, atau `tf bca>cash 500rb`. Balasan berisi ringkasan
  dan saldo kantong.
- **Kartu kredit / paylater**: limit, tanggal statement, dan jatuh tempo; tagihan = saldo
  negatif, pembayaran lewat transfer, dan otomatis muncul di "Akan datang".
- **PWA**: installable + offline shell (`public/sw.js`, manifest berbasis `src/app/manifest.ts`).
- **Kualitas**: E2E Playwright untuk alur kritis, rate limit mutasi, dan pelaporan error
  terstruktur (opsional ke Sentry lewat `SENTRY_DSN`).
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

> Service worker **tidak** meng-cache aset build (`/_next/*`): nama chunk di dev itu stabil,
> jadi cache-first pernah menyajikan JS lama setelah kode berubah dan memicu error hydration
> React (#418). Yang di-cache hanya halaman hasil navigasi (network-first, untuk mode offline)
> plus ikon & manifest. Cache diberi versi (`money-tracker-v2`), jadi versi lama otomatis
> dibuang saat service worker baru aktif.
> Kalau aplikasi terasa memakai versi lama: DevTools → Application → Service Workers →
> *Unregister*, lalu hard reload. Bump `CACHE` di [`public/sw.js`](./public/sw.js) saat aturan
> cache diubah.

## Scan struk AI (opsional, gratis)

Fitur ini tidak wajib diisi env apa pun. Tanpa kunci, tombol **Scan struk** tetap muncul
tetapi menampilkan petunjuk aktivasi.

| Opsi | Cocok untuk | Env minimal | Catatan |
| --- | --- | --- | --- |
| **Gemini** (disarankan) | akurasi terbaik, tanpa kartu kredit | `GEMINI_API_KEY` | Free tier; ambil kunci di [aistudio.google.com/apikey](https://aistudio.google.com/apikey). Default model `gemini-3.8-flash`. |
| **OpenRouter** | punya kunci OpenRouter / ingin coba model lain | `OPENROUTER_API_KEY` | Pilih model vision varian `:free`, default `google/gemma-4-31b-it:free`. Daftar gratis: [openrouter.ai/models?max_price=0](https://openrouter.ai/models?fmt=table&max_price=0). |
| **Ollama lokal** | privasi penuh / offline | `OLLAMA_BASE_URL` | Jalankan `ollama pull qwen3-vl:4b` (atau `qwen2.5vl:7b`). Tidak ada data keluar dari komputer. |

Contoh model gratis lain (bisa berubah; sesuaikan env):

- **Gemini**: `gemini-3.8-flash` (default), `gemini-3.6-flash`, `gemini-3.5-flash-lite`.
- **OpenRouter** (`:free`): `google/gemma-4-31b-it:free`, `google/gemma-4-26b-a4b-it:free`,
  `nvidia/nemotron-3.5-super-vl:free`, atau `openrouter/free` (router otomatis).
- **Ollama** (lokal): `qwen3-vl:4b` (default), `qwen3-vl:2b` (RAM kecil), `qwen2.5vl:7b`,
  `deepseek-ocr:3b` (khusus OCR), `llama3.2-vision:11b`.

Urutan auto-detect: Gemini → OpenRouter → Ollama. Untuk memaksa provider/model tertentu:

```bash
RECEIPT_AI_PROVIDER=gemini   # gemini | openrouter | ollama
RECEIPT_AI_MODEL=gemini-3.8-flash
```

Cara kerja:

1. Foto dari kamera/galeri dikecilkan di browser (±1600 px, JPEG) agar hemat kuota.
2. Server mengirim gambar + daftar kategori pengeluaran user ke model vision dengan
   **structured JSON** (Gemini/Ollama) atau prompt JSON (OpenRouter).
3. Hasil dinormalisasi: nominal `Rp 25.000` → `25000`, tanggal `05/11/2026` → `2026-11-05`,
   kategori dicocokkan ke kategori user, metode bayar dicocokkan ke nama kantong.
4. Form transaksi terbuka dengan nominal, tanggal, catatan, kategori, kantong, dan rincian item
   yang sudah terisi. **Periksa dulu, lalu Simpan.**
5. Transaksi hasil scan ditandai `source = 'receipt'`; metadata scan (provider, model,
   confidence, item) disimpan di `transactions.raw_input`. **Foto tidak disimpan.**

> Catatan privasi: pada free tier Gemini/OpenRouter, input dapat dipakai penyedia untuk
> meningkatkan layanan. Untuk struk sensitif, gunakan Ollama lokal. Jangan pernah commit
> API key ke git — isi lewat `.env`/`.env.local`.

## Telegram bot (Fase 2)

1. Buat bot lewat [@BotFather](https://t.me/BotFather), salin token.
2. Isi `.env`:
   ```bash
   TELEGRAM_BOT_TOKEN=123456:ABC...
   TELEGRAM_BOT_USERNAME=money_tracker_bot   # tanpa @
   TELEGRAM_WEBHOOK_SECRET=string-acak-panjang
   ```
3. Deploy ke HTTPS, lalu daftarkan webhook (sekali):
   ```
   https://api.telegram.org/bot<token>/setWebhook?url=https://<domain>/api/webhooks/telegram&secret_token=<secret>
   ```
4. Buka **Pengaturan → Telegram → Buat kode tautan**, lalu kirim `/start <token>` ke bot.
   Kode berlaku 15 menit dan langsung hangus setelah dipakai.

Contoh pesan:

```
makan siang 25rb gopay
+5jt gaji bca
tf bca>cash 500rb
```

Perintah `/saldo` menampilkan saldo kantong, `/help` contoh format. Pesan dari chat yang
belum tertaut ditolak. Idempotensi memakai `ingest_events` (`external_message_id`), jadi
retry webhook Telegram tidak membuat transaksi ganda. Untuk menguji lokal tanpa HTTPS,
pakai tunnel (mis. ngrok) atau jalankan tes `npm test` yang menguji parser + handler.

## Cron & backup

- `vercel.json` menjadwalkan `/api/cron/templates` setiap **17:00 UTC (00:00 WIB)** untuk
  memposting template jatuh tempo semua user dan membersihkan token Telegram kedaluwarsa.
- Isi `CRON_SECRET`; Vercel Cron mengirim `Authorization: Bearer <secret>`. Manual:
  `curl -H "Authorization: Bearer <secret>" https://<domain>/api/cron/templates`.
- **Pengaturan → Data** menyediakan ekspor CSV, ekspor backup JSON (seluruh data), impor CSV
  dengan pratinjau, dan restore JSON. Restore **mengganti** seluruh data akun dan wajib
  mengetik `PULIHKAN`.

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
| `npm test` | Vitest: service layer (transfer atomik, idempotensi, batas bulan WIB, invariant saldo, goal, backup, Telegram) + unit money/dates/rate limit. |
| `npm run test:e2e` | Playwright: build produksi lalu uji alur kritis (dashboard, buat kantong, catat transaksi, laporan). |
| `npm run test:e2e:install` | Unduh browser Chromium untuk Playwright (sekali per mesin). |
| `npm run db:generate` | Generate migrasi Drizzle dari `src/server/db/schema.ts`. |
| `npm run db:migrate` | Jalankan migrasi ke `DATABASE_URL` (atau PGlite bila kosong). |
| `npm run db:seed` | Seed kategori default (juga otomatis dijalankan saat aplikasi pertama dibuka). |
| `npm run icons` | Regenerasi ikon PWA (`/public/icons/*`, `src/app/icon.png`, `apple-icon.png`) dari `public/icons/no-background-mm.png` tanpa dependency. |
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
    (app)/            # area terautentikasi: dashboard, transactions, wallets, debts, reports, items, settings
    (auth)/login      # login Supabase (mode lokal auto-redirect)
    api/export        # ekspor CSV
    manifest.ts, icon.png, apple-icon.png   # PWA
  components/app/     # AppShell (bottom nav/sidebar), sheet transaksi + numpad, daftar transaksi, dll.
  server/
    db/               # schema Drizzle + client (PGlite ⇄ Postgres) + view wallet_balances
    services/         # transaksi, wallet, kategori, item, budget, goal, hutang, laporan,
                      # template, import/backup, Telegram
    actions/          # Server Actions (validasi Zod + auth + rate limit + revalidate)
  lib/                # money (integer), dates (WIB), zod schemas, view types,
                      # parser Telegram, offline queue, rate limit, observability
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
- **Rincian item** disimpan di `transaction_items` dengan `name` sebagai snapshot (riwayat tetap
  utuh walau item katalognya dihapus) dan `qty_milli` = jumlah × 1000 agar tetap integer. Total
  rincian divalidasi ≤ nominal transaksi di service layer, dan penyimpanannya satu transaksi DB
  bersama transaksinya. Item katalog (`items`) di-*upsert* otomatis dari nama + harga terakhir.
- **Hutang & piutang** tidak punya kolom status/saldo sendiri: `debts` menyimpan perjanjian
  (pokok, pihak, tujuan, kantong sumber dana & kantong pembayaran) dan `debt_payments` menyimpan
  tiap angsuran yang **selalu** terhubung ke satu baris ledger. Sisa = pokok − pembayaran aktif,
  jadi menghapus transaksi dari Riwayat otomatis mengoreksi sisanya. Arus kasnya nyata:
  menerima pinjaman = `income`, membayar = `expense` (dan kebalikannya untuk piutang), memakai
  kategori otomatis `Pinjaman Masuk` / `Bayar Hutang` / `Beri Pinjaman` / `Terima Piutang`.
- **Template transaksi** (`transaction_templates`) menyimpan tipe, nominal, kantong, kategori,
  tag, dan `items` (jsonb) sebagai resep — bukan ledger, jadi rinciannya baru menjadi baris
  `transaction_items` saat template dipakai. `frequency` + `next_run_at` membuat posting
  otomatis tanpa cron: layout aplikasi memproses template yang jatuh tempo, mengklaim tiap
  kemunculan dengan update bersyarat (anti-dobel), dan melewati kemunculan lebih tua dari 31
  hari agar ledger tidak dibanjiri data lama. Transaksinya ditandai `source = 'template'`.
- **Zona waktu**: batas bulan & tren harian dihitung WIB di SQL
  (`occurred_at + 7 jam` → hari WIB), bukan zona server.
- **Goal** tidak punya kolom "terkumpul": progres = saldo kantong yang ditautkan, dan satu
  kantong hanya boleh menjadi sumber satu goal aktif. Kartu kredit tidak boleh dipakai.
- **Kartu kredit** memakai saldo negatif sebagai tagihan; pemakaian = `expense`, pembayaran =
  transfer ke kantong kredit. Limit/statement/due hanya metadata, bukan saldo.
- **Offline queue** menyimpan payload transaksi di IndexedDB dan mengirimnya ke
  `/api/transactions`; `client_request_id` yang sama membuat retry idempoten.
- **Rate limit** in-memory membatasi mutasi sensitif per user (transaksi, scan struk, import,
  restore, tautan Telegram). Di serverless batas berlaku per instance.
- **RLS** sebagai backstop di Supabase; service layer juga selalu memfilter `user_id`.

## Deploy (Vercel + Supabase)

1. Buat project Supabase → jalankan `npm run db:migrate` dengan `DATABASE_URL` project tsb.
2. Import repo ke Vercel, set env: `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (atau `NEXT_PUBLIC_SUPABASE_ANON_KEY`), dan
   `SUPABASE_SECRET_KEY` bila ingin fitur hapus akun ikut menghapus user auth.
   Opsional: `CRON_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`,
   `TELEGRAM_WEBHOOK_SECRET`, `SENTRY_DSN`.
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

## Fase 2 (Telegram sudah tersedia)

Telegram ingestion sudah aktif: tabel `channel_links`, `channel_link_tokens`, dan
`ingest_events`, webhook `/api/webhooks/telegram`, serta parser deterministik. WhatsApp
belum dibangun; skema `channel_links` sudah mengenal channel `whatsapp`, dan kolom
`transactions.source`/`raw_input`/`status` tetap dipakai untuk ingestion berikutnya.
