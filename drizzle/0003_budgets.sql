-- 0003: budget bulanan per kategori pengeluaran.
--
-- Satu baris per (user, kategori). `amount` = batas per bulan yang berlaku untuk
-- setiap bulan; `enabled` memungkinkan budget dimatikan tanpa menghapus angkanya
-- (mis. bulan sibuk atau kategori yang sedang tidak dipantau).

create table if not exists "budgets" (
	"id" uuid primary key default gen_random_uuid() not null,
	"user_id" uuid not null,
	"category_id" uuid not null,
	"amount" bigint not null,
	"enabled" boolean default true not null,
	"created_at" timestamp with time zone default now() not null,
	"updated_at" timestamp with time zone default now() not null,
	constraint "budgets_amount_check" check ("budgets"."amount" > 0)
);

--> statement-breakpoint
alter table "budgets"
  drop constraint if exists "budgets_category_id_fkey";

--> statement-breakpoint
alter table "budgets"
  add constraint "budgets_category_id_fkey"
  foreign key ("category_id") references "categories"("id") on delete cascade;

--> statement-breakpoint
create unique index if not exists "budgets_user_category_uq"
  on "budgets" ("user_id", "category_id");

--> statement-breakpoint
create index if not exists "budgets_category_idx" on "budgets" ("category_id");

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
    alter table "budgets" enable row level security;

    drop policy if exists "budgets_owner_all" on "budgets";
    create policy "budgets_owner_all" on "budgets"
      for all to authenticated
      using ("user_id" = (select auth.uid()))
      with check ("user_id" = (select auth.uid()));

    grant select, insert, update, delete on "budgets" to authenticated;
  end if;
end
$rls$;
