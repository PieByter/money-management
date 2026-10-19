-- 0004: katalog item + rincian item per transaksi (mode belanja itemized).
--
-- `items` adalah katalog yang bisa dipakai ulang (nama, harga terakhir, kategori
-- default). `transaction_items` menyimpan rincian yang benar-benar dibeli pada
-- satu transaksi, sehingga total belanja bisa ditelusuri per barang.
--
-- Catatan desain:
--   * `amount` di transaction_items = total baris (integer rupiah) dan merupakan
--     sumber kebenaran; `qty_milli` = jumlah × 1000 (mis. 500 = 0,5 kg) supaya
--     tidak butuh float. Harga satuan hanya ditampilkan (amount / qty).
--   * `name` disalin (snapshot) agar riwayat tetap utuh walau item katalog
--     dihapus; `item_id` jadi null bila katalognya dihapus.

create table if not exists "items" (
	"id" uuid primary key default gen_random_uuid() not null,
	"user_id" uuid not null,
	"name" text not null,
	"unit" text,
	"last_price" bigint,
	"category_id" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone default now() not null,
	"updated_at" timestamp with time zone default now() not null,
	constraint "items_last_price_check" check ("items"."last_price" is null or "items"."last_price" > 0)
);

--> statement-breakpoint
alter table "items"
  drop constraint if exists "items_category_id_fkey";

--> statement-breakpoint
alter table "items"
  add constraint "items_category_id_fkey"
  foreign key ("category_id") references "categories"("id") on delete set null;

--> statement-breakpoint
create unique index if not exists "items_user_name_uq"
  on "items" ("user_id", lower("name"))
  where archived_at is null;

--> statement-breakpoint
create index if not exists "items_user_idx" on "items" ("user_id");

--> statement-breakpoint
create index if not exists "items_category_idx" on "items" ("category_id");

--> statement-breakpoint
create table if not exists "transaction_items" (
	"id" uuid primary key default gen_random_uuid() not null,
	"user_id" uuid not null,
	"transaction_id" uuid not null,
	"item_id" uuid,
	"name" text not null,
	"qty_milli" bigint default 1000 not null,
	"amount" bigint not null,
	"created_at" timestamp with time zone default now() not null,
	constraint "transaction_items_amount_check" check ("transaction_items"."amount" > 0),
	constraint "transaction_items_qty_check" check ("transaction_items"."qty_milli" > 0)
);

--> statement-breakpoint
alter table "transaction_items"
  drop constraint if exists "transaction_items_transaction_id_fkey";

--> statement-breakpoint
alter table "transaction_items"
  add constraint "transaction_items_transaction_id_fkey"
  foreign key ("transaction_id") references "transactions"("id") on delete cascade;

--> statement-breakpoint
alter table "transaction_items"
  drop constraint if exists "transaction_items_item_id_fkey";

--> statement-breakpoint
alter table "transaction_items"
  add constraint "transaction_items_item_id_fkey"
  foreign key ("item_id") references "items"("id") on delete set null;

--> statement-breakpoint
create index if not exists "transaction_items_transaction_idx"
  on "transaction_items" ("transaction_id");

--> statement-breakpoint
create index if not exists "transaction_items_item_idx" on "transaction_items" ("item_id");

--> statement-breakpoint
create index if not exists "transaction_items_user_idx" on "transaction_items" ("user_id");

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
    alter table "items" enable row level security;
    alter table "transaction_items" enable row level security;

    drop policy if exists "items_owner_all" on "items";
    create policy "items_owner_all" on "items"
      for all to authenticated
      using ("user_id" = (select auth.uid()))
      with check ("user_id" = (select auth.uid()));

    drop policy if exists "transaction_items_owner_all" on "transaction_items";
    create policy "transaction_items_owner_all" on "transaction_items"
      for all to authenticated
      using ("user_id" = (select auth.uid()))
      with check ("user_id" = (select auth.uid()));

    grant select, insert, update, delete on "items" to authenticated;
    grant select, insert, update, delete on "transaction_items" to authenticated;
  end if;
end
$rls$;
