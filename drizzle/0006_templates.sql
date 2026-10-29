-- 0006: template transaksi (transaksi berulang) + sumber 'template' pada ledger.
--
-- Desain:
--   * `transaction_templates` menyimpan "resep" transaksi: tipe, nominal,
--     kantong, kategori, catatan, tag, dan rincian item (jsonb, snapshot).
--   * `frequency` = 'none' berarti template hanya dipakai manual. Selain itu
--     `next_run_at` menyimpan kemunculan berikutnya (pukul 00:00 WIB) dan
--     diproses otomatis saat aplikasi dibuka, sehingga tidak butuh cron.
--   * `weekday` memakai kalender Indonesia: Senin = 1 … Minggu = 7.
--   * Transaksi hasil template ditandai `source = 'template'`.

create table if not exists "transaction_templates" (
	"id" uuid primary key default gen_random_uuid() not null,
	"user_id" uuid not null,
	"name" text not null,
	"kind" text not null,
	"amount" bigint not null,
	"wallet_id" uuid not null,
	"category_id" uuid,
	"note" text,
	"tags" text[] default '{}'::text[] not null,
	"items" jsonb default '[]'::jsonb not null,
	"frequency" text default 'none' not null,
	"weekday" smallint,
	"day_of_month" smallint,
	"next_run_at" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"created_at" timestamp with time zone default now() not null,
	"updated_at" timestamp with time zone default now() not null,
	constraint "transaction_templates_kind_check" check ("transaction_templates"."kind" in ('income','expense')),
	constraint "transaction_templates_amount_check" check ("transaction_templates"."amount" > 0),
	constraint "transaction_templates_frequency_check" check ("transaction_templates"."frequency" in ('none','daily','weekly','monthly')),
	constraint "transaction_templates_weekday_check" check ("transaction_templates"."weekday" is null or ("transaction_templates"."weekday" between 1 and 7)),
	constraint "transaction_templates_day_check" check ("transaction_templates"."day_of_month" is null or ("transaction_templates"."day_of_month" between 1 and 31))
);

--> statement-breakpoint
alter table "transaction_templates"
  drop constraint if exists "transaction_templates_wallet_id_fkey";

--> statement-breakpoint
alter table "transaction_templates"
  add constraint "transaction_templates_wallet_id_fkey"
  foreign key ("wallet_id") references "wallets"("id");

--> statement-breakpoint
alter table "transaction_templates"
  drop constraint if exists "transaction_templates_category_id_fkey";

--> statement-breakpoint
alter table "transaction_templates"
  add constraint "transaction_templates_category_id_fkey"
  foreign key ("category_id") references "categories"("id") on delete set null;

--> statement-breakpoint
create unique index if not exists "transaction_templates_user_name_uq"
  on "transaction_templates" ("user_id", lower("name"));

--> statement-breakpoint
create index if not exists "transaction_templates_user_idx"
  on "transaction_templates" ("user_id");

--> statement-breakpoint
create index if not exists "transaction_templates_due_idx"
  on "transaction_templates" ("next_run_at")
  where "next_run_at" is not null;

--> statement-breakpoint
-- Ledger kini mengenal transaksi yang lahir dari template.
alter table "transactions" drop constraint if exists "transactions_source_check";

--> statement-breakpoint
alter table "transactions"
  add constraint "transactions_source_check"
  check ("source" in ('web','telegram','whatsapp','import','template'));

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
    alter table "transaction_templates" enable row level security;

    drop policy if exists "transaction_templates_owner_all" on "transaction_templates";
    create policy "transaction_templates_owner_all" on "transaction_templates"
      for all to authenticated
      using ("user_id" = (select auth.uid()))
      with check ("user_id" = (select auth.uid()));

    grant select, insert, update, delete on "transaction_templates" to authenticated;
  end if;
end
$rls$;
