-- 0005: hutang & piutang (debt) beserta riwayat pembayarannya.
--
-- Desain:
--   * `direction` = 'payable' (uang yang saya pinjam) | 'receivable' (uang
--     yang saya pinjamkan).
--   * `funding_wallet_id`  = kantong tempat uang pinjaman masuk/keluar
--     (mis. Bank Jago). Transaksinya dicatat di ledger `income`/`expense` dan
--     id-nya disimpan di `funding_transaction_id`.
--   * `payment_wallet_id`  = kantong default untuk angsuran/pelunasan
--     (mis. Dana). Tiap angsuran tetap menyimpan kantong aslinya sendiri.
--   * Status lunas tidak pernah disimpan: selalu dihitung dari jumlah
--     `debt_payments` yang transaksinya belum dihapus, sehingga angka debt
--     tidak bisa melenceng dari ledger.

create table if not exists "debts" (
	"id" uuid primary key default gen_random_uuid() not null,
	"user_id" uuid not null,
	"direction" text not null,
	"counterparty" text not null,
	"purpose" text,
	"principal" bigint not null,
	"funding_wallet_id" uuid not null,
	"payment_wallet_id" uuid not null,
	"funding_transaction_id" uuid,
	"started_at" timestamp with time zone not null,
	"due_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone default now() not null,
	"updated_at" timestamp with time zone default now() not null,
	constraint "debts_direction_check" check ("debts"."direction" in ('payable','receivable')),
	constraint "debts_principal_check" check ("debts"."principal" > 0)
);

--> statement-breakpoint
alter table "debts"
  drop constraint if exists "debts_funding_wallet_id_fkey";

--> statement-breakpoint
alter table "debts"
  add constraint "debts_funding_wallet_id_fkey"
  foreign key ("funding_wallet_id") references "wallets"("id");

--> statement-breakpoint
alter table "debts"
  drop constraint if exists "debts_payment_wallet_id_fkey";

--> statement-breakpoint
alter table "debts"
  add constraint "debts_payment_wallet_id_fkey"
  foreign key ("payment_wallet_id") references "wallets"("id");

--> statement-breakpoint
alter table "debts"
  drop constraint if exists "debts_funding_transaction_id_fkey";

--> statement-breakpoint
alter table "debts"
  add constraint "debts_funding_transaction_id_fkey"
  foreign key ("funding_transaction_id") references "transactions"("id") on delete set null;

--> statement-breakpoint
create index if not exists "debts_user_idx" on "debts" ("user_id");

--> statement-breakpoint
create index if not exists "debts_user_direction_idx" on "debts" ("user_id", "direction");

--> statement-breakpoint
create index if not exists "debts_funding_wallet_idx" on "debts" ("funding_wallet_id");

--> statement-breakpoint
create index if not exists "debts_payment_wallet_idx" on "debts" ("payment_wallet_id");

--> statement-breakpoint
create index if not exists "debts_funding_transaction_idx" on "debts" ("funding_transaction_id");

--> statement-breakpoint
create table if not exists "debt_payments" (
	"id" uuid primary key default gen_random_uuid() not null,
	"user_id" uuid not null,
	"debt_id" uuid not null,
	"wallet_id" uuid not null,
	"amount" bigint not null,
	"occurred_at" timestamp with time zone not null,
	"note" text,
	"transaction_id" uuid,
	"created_at" timestamp with time zone default now() not null,
	constraint "debt_payments_amount_check" check ("debt_payments"."amount" > 0)
);

--> statement-breakpoint
alter table "debt_payments"
  drop constraint if exists "debt_payments_debt_id_fkey";

--> statement-breakpoint
alter table "debt_payments"
  add constraint "debt_payments_debt_id_fkey"
  foreign key ("debt_id") references "debts"("id") on delete cascade;

--> statement-breakpoint
alter table "debt_payments"
  drop constraint if exists "debt_payments_wallet_id_fkey";

--> statement-breakpoint
alter table "debt_payments"
  add constraint "debt_payments_wallet_id_fkey"
  foreign key ("wallet_id") references "wallets"("id");

--> statement-breakpoint
alter table "debt_payments"
  drop constraint if exists "debt_payments_transaction_id_fkey";

--> statement-breakpoint
alter table "debt_payments"
  add constraint "debt_payments_transaction_id_fkey"
  foreign key ("transaction_id") references "transactions"("id") on delete set null;

--> statement-breakpoint
create index if not exists "debt_payments_debt_idx" on "debt_payments" ("debt_id");

--> statement-breakpoint
create index if not exists "debt_payments_user_idx" on "debt_payments" ("user_id");

--> statement-breakpoint
create index if not exists "debt_payments_wallet_idx" on "debt_payments" ("wallet_id");

--> statement-breakpoint
create index if not exists "debt_payments_transaction_idx" on "debt_payments" ("transaction_id");

--> statement-breakpoint
-- RLS + grant, hanya berlaku di Supabase (dilewati di PGlite/lokal).
do $rls$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated')
     and exists (
       select 1
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'auth' and p.proname = 'uid'
     )
  then
    alter table "debts" enable row level security;
    alter table "debt_payments" enable row level security;

    drop policy if exists "debts_owner_all" on "debts";
    create policy "debts_owner_all" on "debts"
      for all to authenticated
      using ("user_id" = (select auth.uid()))
      with check ("user_id" = (select auth.uid()));

    drop policy if exists "debt_payments_owner_all" on "debt_payments";
    create policy "debt_payments_owner_all" on "debt_payments"
      for all to authenticated
      using ("user_id" = (select auth.uid()))
      with check ("user_id" = (select auth.uid()));

    grant select, insert, update, delete on "debts" to authenticated;
    grant select, insert, update, delete on "debt_payments" to authenticated;
  end if;
end
$rls$;
