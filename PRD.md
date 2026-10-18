# PRD — Money Tracker (Next.js + Supabase)

*Versi 0.1 · Fokus fase 1: web form, mobile-first PWA · Fase 2: input via Telegram/WhatsApp*

## 1. Ringkasan

Aplikasi pencatat keuangan pribadi yang menjawab satu pertanyaan utama: **"Bulan ini uang masuk berapa, keluar berapa, dan sekarang uangnya ada di kantong mana saja?"**

Uang dipisah per **kantong** (cash, rekening bank, dompet digital seperti GoPay/OVO/Dana/ShopeePay). Setiap transaksi (masuk, keluar, pindah antar kantong) tercatat sebagai ledger yang konsisten, sehingga saldo setiap kantong bisa dilacak dan dipertanggungjawabkan.

Fase 1 hanya input lewat form web yang cepat dan nyaman di HP. Arsitektur sudah disiapkan supaya fase 2 (chat Telegram/WhatsApp dengan parsing teks singkat, mirip alur n8n) tinggal menambah *ingestion layer* tanpa mengubah core.

## 2. Tujuan dan Non-Tujuan

### Tujuan (Fase 1)

1. Catat transaksi dalam **≤ 10 detik** dan **≤ 4 tap** dari home screen di HP.
2. Dashboard bulan berjalan: total pemasukan, total pengeluaran, selisih (net), saldo per kantong, breakdown per kategori.
3. Saldo kantong **selalu benar** (bisa direkonsiliasi dengan saldo riil).
4. Bisa di-install sebagai PWA, nyaman dipakai satu tangan.
5. Schema dan API siap untuk input multi-channel (web, Telegram, WhatsApp).

### Non-Tujuan (Fase 1)

- Integrasi Telegram/WhatsApp (fase 2, tapi **desain datanya disiapkan sekarang**).
- Sinkronisasi otomatis mutasi bank / open banking.
- Multi-user kolaboratif (household sharing), invoice, pajak, investasi, utang-piutang kompleks.
- Multi-currency (IDR saja dulu, tapi kolom `currency` tetap ada).
- Native mobile app.

## 3. Persona dan Use Case

**Persona utama:** individu (mahasiswa/karyawan/pemilik usaha kecil) yang punya 3 sampai 8 kantong uang tersebar di cash, bank, dan e-wallet, dan sering lupa uangnya habis ke mana.

| # | User story | Prioritas |
| --- | --- | --- |
| U1 | Sebagai user, saya ingin mencatat pengeluaran dengan nominal, kantong, kategori, dan catatan secepat mungkin. | P0 |
| U2 | Saya ingin mencatat pemasukan (gaji, jual, dll.) ke kantong tertentu. | P0 |
| U3 | Saya ingin memindahkan uang antar kantong (mis. tarik tunai ATM: Bank → Cash; top up GoPay: Bank → GoPay) tanpa dihitung sebagai pemasukan/pengeluaran. | P0 |
| U4 | Saya ingin melihat ringkasan bulan ini: masuk, keluar, net, dan saldo tiap kantong. | P0 |
| U5 | Saya ingin melihat riwayat transaksi dengan filter (bulan, kantong, kategori, tipe) dan pencarian. | P0 |
| U6 | Saya ingin mengedit atau menghapus transaksi yang salah input, dan saldo ikut benar. | P0 |
| U7 | Saya ingin mengelola kantong dan kategori sendiri. | P1 |
| U8 | Saya ingin mencocokkan saldo aplikasi dengan saldo riil (rekonsiliasi) dan menyimpan selisihnya sebagai adjustment. | P1 |
| U9 | Saya ingin transaksi berulang (langganan, cicilan). | P2 |
| U10 | Saya ingin budget per kategori per bulan. | P2 |
| U11 | Saya ingin mencatat lewat chat singkat, mis. `makan siang 25rb gopay`. | Fase 2 |

## 4. Konsep Domain: Flow Kantong

Satu tabel transaksi dengan tiga tipe. Ini keputusan desain terpenting, karena menentukan apakah laporan bisa dipercaya.

| Tipe | Efek saldo | Masuk laporan pemasukan/pengeluaran? |
| --- | --- | --- |
| `income` | + di satu kantong | Ya, sebagai pemasukan |
| `expense` | − di satu kantong | Ya, sebagai pengeluaran |
| `transfer` | − di kantong asal, + di kantong tujuan (plus fee opsional) | **Tidak**, kecuali biaya admin yang dicatat sebagai expense terpisah |

**Aturan penting:**

- Transfer **bukan** pemasukan dan **bukan** pengeluaran. Kesalahan paling umum di app sejenis adalah menghitung top up e-wallet sebagai pengeluaran, sehingga laporan menggelembung dua kali.
- Biaya admin transfer/top up dicatat sebagai `expense` terpisah dengan kategori "Biaya Admin", ditautkan lewat `group_id`.
- Saldo awal kantong dicatat sebagai transaksi bertipe `adjustment` / `opening_balance`, bukan kolom saldo yang diedit manual.

### Contoh flow

1. Gaji Rp5.000.000 masuk ke BCA → `income`, wallet=BCA.
2. Tarik tunai Rp500.000 → `transfer`, BCA → Cash.
3. Top up GoPay Rp200.000 (admin Rp1.000) → `transfer` BCA → GoPay + `expense` Rp1.000 (Biaya Admin), satu `group_id`.
4. Makan siang Rp25.000 pakai GoPay → `expense`, wallet=GoPay.

Hasil bulan ini: masuk 5.000.000, keluar 26.000, net +4.974.000, tapi saldo kantong terdistribusi: BCA 4.299.000, Cash 500.000, GoPay 175.000.

## 5. Fitur dan Kebutuhan Fungsional (Fase 1)

### 5.1 Autentikasi

- Supabase Auth: email magic link + Google OAuth. Tanpa password custom.
- Session via `@supabase/ssr` (cookie-based, aman untuk Server Components dan Server Actions).

### 5.2 Kantong (Wallets)

- CRUD kantong: nama, tipe (`cash`, `bank`, `ewallet`, `other`), ikon/warna, urutan, status arsip.
- Saldo awal saat pembuatan (otomatis jadi transaksi opening balance).
- Kantong yang sudah punya transaksi **tidak boleh dihapus**, hanya diarsipkan.

### 5.3 Transaksi

- Form tambah: tipe (segmented control Keluar/Masuk/Pindah), nominal, kantong, kategori, tanggal (default sekarang), catatan, tag opsional.
- Input nominal: numpad besar, format ribuan otomatis, shortcut `+000` untuk ribuan (mis. ketik `25` lalu tap "rb" jadi 25.000).
- Kantong dan kategori terakhir/paling sering dipakai muncul sebagai chip di atas (satu tap).
- Edit dan hapus (soft delete). Edit transfer mengedit kedua sisi secara atomik.
- Daftar transaksi dengan infinite scroll (cursor pagination), grup per hari, swipe untuk hapus/edit.

### 5.4 Dashboard bulan ini

- Pemilih bulan (default bulan berjalan, zona waktu `Asia/Jakarta`).
- Kartu: Total Masuk, Total Keluar, Net.
- Daftar kantong dengan saldo saat ini dan total aset.
- Grafik: pengeluaran per kategori (donut atau bar), tren harian (line/bar).
- 5 transaksi terakhir dan tombol aksi cepat (FAB) untuk tambah transaksi.

### 5.5 Kategori

- Seed default (Makan, Transport, Belanja, Tagihan, Kesehatan, Hiburan, Gaji, Usaha, dll.), bisa ditambah/diubah/diarsipkan.
- Kategori terpisah untuk income dan expense.

### 5.6 Rekonsiliasi (P1)

- User memasukkan saldo riil sebuah kantong → sistem menghitung selisih → membuat transaksi `adjustment` otomatis dengan label jelas.

## 6. UX dan UI

### Prinsip

1. **Mobile-first, thumb-zone first.** Aksi utama ada di bawah layar. Desktop adalah versi melebar dari layout mobile.
2. **Kecepatan input di atas kelengkapan.** Field wajib minimal: nominal + kantong. Kategori punya default cerdas.
3. **Feedback instan.** Optimistic update, tanpa spinner penuh layar.
4. **Angka selalu terbaca.** Tabular numerals, warna semantik konsisten (hijau masuk, merah keluar, netral untuk transfer) dan tidak hanya mengandalkan warna (ikon panah + tanda +/−).
5. Dark mode dan light mode.

### Layar

| Layar | Isi utama |
| --- | --- |
| Home / Dashboard | Ringkasan bulan, kartu kantong (horizontal scroll), grafik, transaksi terbaru |
| Tambah Transaksi | Bottom sheet full-height: segmented tipe, numpad, chip kantong/kategori, tanggal, catatan |
| Riwayat | Filter chips, search, list grup per hari |
| Kantong | Daftar + detail kantong (saldo, mutasi, tombol rekonsiliasi) |
| Laporan | Perbandingan bulan, kategori, tren |
| Pengaturan | Kategori, kantong, ekspor CSV, akun |

### Navigasi

Bottom tab bar (Home, Riwayat, **+**, Kantong, Laporan). Tombol **+** di tengah membuka sheet tambah transaksi.

### Interaksi

- Bottom sheet dengan gestur drag-to-dismiss, haptic-feel lewat animasi spring (Framer Motion).
- Transisi antar bulan dengan swipe horizontal.
- Empty state yang mengarahkan ("Belum ada kantong, buat yang pertama").
- Skeleton loading, bukan spinner.
- Aksesibilitas: target sentuh ≥ 44px, kontras WCAG AA, label form benar.

### Rekomendasi stack UI

Tailwind CSS + shadcn/ui (Radix), `vaul` untuk drawer/bottom sheet, Recharts atau visx untuk grafik, Framer Motion untuk animasi, `react-hook-form` + Zod untuk form.

## 7. Arsitektur Teknis

### 7.1 Stack

| Lapisan | Pilihan | Alasan |
| --- | --- | --- |
| Framework | Next.js (App Router), TypeScript | Full-stack, RSC untuk dashboard, Server Actions untuk mutasi |
| Database | Supabase Postgres | Managed, RLS, Auth terintegrasi |
| ORM | **Drizzle ORM** (rekomendasi) | Ringan, tanpa binary engine, cold start kecil di serverless, SQL-first, migrasi transparan, RLS-friendly. Alternatif: Prisma (DX bagus tapi lebih berat dan perlu penanganan pooler yang lebih hati-hati). |
| Validasi | Zod | Satu schema untuk client, server action, dan webhook fase 2 |
| Data fetching client | TanStack Query | Optimistic update dan cache untuk list |
| Deployment | Vercel + Supabase | Sederhana, cukup untuk skala personal |
| PWA | Serwist (atau `next-pwa` fork yang aktif) | Installable, offline shell |

### 7.2 Keputusan arsitektur dan trade-off

**a. Uang disimpan sebagai integer.** Kolom `amount` bertipe `bigint` dalam satuan terkecil (IDR: rupiah utuh). Tidak ada `float`. Jika nanti multi-currency, tambahkan `currency` dan `minor_unit` (default 0 untuk IDR). Hindari `numeric` di JS karena akan dicasting ke string/number tanpa disiplin.

**b. Saldo dihitung dari ledger, bukan disimpan sebagai kolom yang diedit.**

- Opsi A: `SUM` langsung per query. Cukup sampai puluhan ribu transaksi per user dengan index `(wallet_id, occurred_at)`.
- Opsi B: kolom cache `wallets.balance` yang diupdate trigger. Lebih cepat dibaca, tapi menambah risiko drift.
- **Keputusan:** mulai dengan Opsi A lewat SQL view `wallet_balances`. Naik ke Opsi B (trigger + job rekonsiliasi) hanya bila terukur lambat.

**c. Transfer sebagai dua baris ledger dengan `group_id` yang sama** (leg keluar dan leg masuk), dibuat dalam **satu transaksi database**. Alternatif satu baris dengan `from_wallet`/`to_wallet` lebih ringkas, tetapi membuat query saldo per kantong dan filter laporan lebih rumit (harus UNION). Model dua-leg membuat `SUM(amount) GROUP BY wallet_id` tetap sederhana.

**d. Tanda dan tipe dipisah.** Simpan `kind` (`income`/`expense`/`transfer_out`/`transfer_in`/`adjustment`) dan `amount` selalu positif. Saldo = SUM berdasarkan kind lewat CASE di view. Ini mencegah bug tanda terbalik di UI.

**e. Soft delete** (`deleted_at`) untuk audit dan undo. Semua view/laporan wajib memfilter `deleted_at IS NULL`. Tambahkan partial index.

**f. Zona waktu.** Simpan `occurred_at` sebagai `timestamptz` (UTC). Batas "bulan ini" dihitung di zona `Asia/Jakarta` di SQL (`date_trunc('month', occurred_at AT TIME ZONE 'Asia/Jakarta')`). Transaksi jam 23:30 WIB tanggal 31 tidak boleh masuk bulan berikutnya.

**g. Keamanan: RLS sebagai garis pertahanan utama.**

- Semua tabel punya `user_id` dan policy `user_id = auth.uid()`.
- Jika memakai Drizzle dengan koneksi langsung (service role/pooler), RLS **tidak otomatis berlaku**. Dua opsi: (1) jalankan query dalam transaksi dengan `SET LOCAL request.jwt.claims` agar RLS aktif, atau (2) gunakan koneksi role non-superuser dan terapkan filter `user_id` di layer repository, lalu tetap aktifkan RLS sebagai backstop. Jangan pernah mengekspos service role key ke client.
- Webhook fase 2 berjalan tanpa session user, jadi harus memetakan identitas chat ke `user_id` lewat tabel tautan yang terverifikasi.

**h. Koneksi serverless.** Gunakan Supavisor (transaction pooler, port 6543) dari Vercel; matikan prepared statements bila driver mewajibkan. Untuk migrasi gunakan koneksi direct.

**i. Idempotensi.** Setiap mutasi menerima `client_request_id` (UUID dari client) dengan unique constraint `(user_id, client_request_id)`. Mencegah transaksi ganda karena double-tap, retry jaringan buruk di HP, dan (fase 2) retry webhook Telegram.

**j. Server Actions vs Route Handlers.** Server Actions untuk mutasi dari UI web. Route Handlers (`/api/v1/...`) untuk webhook fase 2 dan kemungkinan klien lain. Keduanya memanggil **service layer yang sama** (`createTransaction`, `createTransfer`), jadi logika bisnis tidak duplikat.

### 7.3 Struktur folder (disarankan)

```
/src
  /app
    /(auth)/login
    /(app)/dashboard | transactions | wallets | reports | settings
    /api/webhooks/telegram   (fase 2)
  /server
    /db        (drizzle schema, client, migrations)
    /services  (transactions, wallets, reports, ingestion)
    /policies  (validasi bisnis)
  /lib        (money, dates, zod schemas)
  /components
```

## 8. Model Data

```sql
-- wallets
id uuid pk, user_id uuid not null,
name text not null, type text check (type in ('cash','bank','ewallet','other')),
color text, icon text, sort_order int default 0,
currency char(3) default 'IDR', archived_at timestamptz,
created_at timestamptz default now()

-- categories
id uuid pk, user_id uuid not null,
name text not null, kind text check (kind in ('income','expense')),
icon text, color text, archived_at timestamptz

-- transactions  (ledger)
id uuid pk, user_id uuid not null,
wallet_id uuid not null references wallets,
kind text not null check (kind in ('income','expense','transfer_in','transfer_out','adjustment')),
amount bigint not null check (amount > 0),
category_id uuid references categories,
group_id uuid,                -- mengikat leg transfer + fee
occurred_at timestamptz not null,
note text,
source text not null default 'web' check (source in ('web','telegram','whatsapp','import')),
raw_input text,               -- teks asli dari chat (fase 2)
status text not null default 'confirmed' check (status in ('draft','confirmed')),
client_request_id uuid,
created_at timestamptz default now(),
updated_at timestamptz default now(),
deleted_at timestamptz,
unique (user_id, client_request_id)

-- index
(user_id, occurred_at desc) where deleted_at is null
(wallet_id, occurred_at)    where deleted_at is null
(group_id)
```

**View `wallet_balances`:** saldo = SUM(`income`, `transfer_in`, `adjustment` positif) − SUM(`expense`, `transfer_out`). Untuk `adjustment` negatif, gunakan dua kind (`adjustment_in` / `adjustment_out`) agar `amount > 0` tetap berlaku.

**Tabel fase 2 (siapkan migrasinya nanti, bukan sekarang):** `channel_links` (user\_id, channel, external\_chat\_id, verified\_at), `ingest_events` (id, channel, external\_message\_id unique, payload jsonb, parsed jsonb, status, error, created\_at).

## 9. Kebutuhan Non-Fungsional

| Aspek | Target |
| --- | --- |
| Performa | LCP < 2,5 dtk di 4G, interaksi input < 100 ms (optimistic) |
| Ketersediaan | Mengikuti SLA Vercel + Supabase |
| Integritas data | Mutasi multi-baris selalu dalam satu DB transaction; tidak ada saldo negatif diam-diam (lihat aturan di bawah) |
| Keamanan | RLS aktif di semua tabel, validasi Zod di server, rate limit pada endpoint mutasi, tanpa secret di client |
| Privasi | Data keuangan sensitif: enkripsi at-rest bawaan Supabase, ekspor dan hapus akun tersedia |
| Backup | Supabase daily backup (cek tier), ekspor CSV mandiri |
| Observabilitas | Sentry untuk error, log terstruktur untuk service layer |
| Aksesibilitas | WCAG AA |
| Offline | Shell PWA tersedia offline; antrean tulis offline = P2 (lihat risiko) |

**Aturan saldo negatif:** default memperbolehkan dengan peringatan visual (user mungkin lupa mencatat pemasukan). Setting per kantong untuk "larang saldo negatif" (P2). Ini keputusan produk yang perlu dikonfirmasi.

## 10. Rancangan Fase 2: Telegram / WhatsApp

Tidak dibangun sekarang, tetapi keputusan fase 1 harus mendukungnya.

**Alur:** pesan masuk → webhook (`/api/webhooks/telegram`) → verifikasi secret token + idempotensi (`external_message_id`) → map `chat_id` ke `user_id` → parser → (jika yakin) buat transaksi, (jika ragu) buat `draft` dan balas dengan tombol konfirmasi → balasan ringkas berisi saldo kantong.

**Parser bertingkat:**

1. **Deterministik (regex/grammar)** untuk pola umum: `25rb makan gopay`, `+5jt gaji bca`, `tf bca>cash 500rb`. Murah, cepat, dan dapat diuji.
2. **LLM fallback** dengan structured output (JSON schema yang sama dengan Zod) untuk kalimat bebas. Nama kantong dan kategori dicocokkan fuzzy terhadap daftar milik user, bukan dibiarkan bebas.
3. Confidence rendah atau ambigu → `draft` + konfirmasi, **jangan auto-commit**.

**Catatan trade-off:**

- **Telegram dulu.** Bot API gratis, webhook sederhana, ada inline keyboard untuk konfirmasi.
- **WhatsApp:** Cloud API resmi memerlukan akun bisnis dan verifikasi serta ada template/biaya percakapan; library tidak resmi (mis. berbasis WhatsApp Web) berisiko nomor diblokir. Jangan dijadikan dependensi inti.
- **n8n:** bisa dipakai sebagai orkestrator, tetapi untuk skala satu pengguna webhook langsung di Next.js lebih sedikit komponen yang dioperasikan. n8n masuk akal bila ingin workflow visual atau banyak integrasi.
- Webhook Vercel punya batas waktu eksekusi; balas 200 cepat dan proses berat (LLM) secara asinkron (mis. Supabase Edge Function/queue) agar Telegram tidak me-retry.
- Teks chat dan input LLM berisi data finansial: tentukan kebijakan data ke penyedia LLM sebelum dipakai.

## 11. Metrik Keberhasilan

- Waktu median input transaksi < 10 detik.
- ≥ 90% transaksi tercatat dalam hari yang sama dengan kejadiannya (indikator kebiasaan terbentuk).
- Selisih rekonsiliasi per bulan menurun seiring waktu.
- Retensi: user aktif mencatat ≥ 4 hari/minggu setelah 4 minggu.
- Zero kasus saldo tidak konsisten (diverifikasi lewat tes properti: total saldo = Σ income − Σ expense + adjustment).

## 12. Rencana Rilis

| Milestone | Isi | Perkiraan |
| --- | --- | --- |
| M0 | Setup repo, Supabase, Drizzle schema + migrasi, RLS, Auth, CI | 2 hari |
| M1 | Wallets + kategori CRUD, service layer transaksi (income/expense/transfer) + tes | 4 hari |
| M2 | UI tambah transaksi (bottom sheet, numpad), riwayat, edit/hapus | 4 hari |
| M3 | Dashboard bulan ini, grafik, saldo kantong | 3 hari |
| M4 | PWA, polish UX mobile, dark mode, rekonsiliasi, ekspor CSV | 3 hari |
| M5 | Beta pribadi 2 minggu, perbaikan | 2 minggu |
| Fase 2 | Telegram bot, parser, konfirmasi draft | menyusul |

## 13. Risiko dan Mitigasi

| Risiko | Dampak | Mitigasi |
| --- | --- | --- |
| Drift saldo vs riil | User kehilangan kepercayaan | Ledger-derived balance, fitur rekonsiliasi, tes properti |
| RLS bocor karena koneksi service role/ORM | Data user lain terbaca | Transaction-scoped JWT claims atau role non-bypass, tes otomatis lintas-user |
| Double submit di jaringan buruk | Transaksi ganda | `client_request_id` + unique constraint |
| Bug zona waktu di batas bulan | Laporan salah | Hitung di SQL dengan `Asia/Jakarta`, tes dengan data 31 Des 23:59 |
| Friksi input terlalu tinggi | App ditinggalkan | Default cerdas, chip terakhir dipakai, target ≤ 4 tap |
| Edit transfer merusak satu sisi | Saldo tidak seimbang | Edit hanya via service yang mengubah kedua leg dalam satu transaction |
| Offline write queue | Konflik dan duplikasi | Tunda ke P2; gunakan idempotency key saat dibangun |
| Ketergantungan WhatsApp tidak resmi | Nomor diblokir | Telegram dulu, WhatsApp resmi sebagai opsional |

## 14. Pertanyaan Terbuka

1. Hanya satu pengguna (pribadi) atau akan dibuka sebagai produk multi-user? Ini memengaruhi seberapa ketat RLS, rate limit, dan billing.
2. Apakah perlu pelacakan utang/piutang dan kartu kredit (saldo kantong negatif yang disengaja) di roadmap dekat?
3. Bahasa UI: Indonesia saja, atau siap i18n?
4. Perlu mode "usaha vs pribadi" (misalnya untuk toko bengkel keluarga) dalam satu akun? Jika ya, tambahkan konsep `workspace` sekarang karena mahal diubah belakangan.
5. Kebijakan saldo negatif per kantong (izinkan, peringatkan, atau blokir)?

## 15. Definition of Done (Fase 1)

- Semua user story P0 dan P1 lulus uji manual di Android dan iOS Safari/Chrome.
- Tes otomatis: service layer transaksi (termasuk transfer atomik dan idempotensi), perhitungan saldo, batas bulan WIB, RLS lintas-user.
- Lighthouse PWA/Performance/Accessibility ≥ 90.
- Migrasi dan seed berjalan dari nol dengan satu perintah.
- Dokumentasi singkat env var, setup Supabase, dan cara menjalankan lokal.
