-- 0009: tujuan tabungan (goals).
--
-- Progres goal = saldo kantong yang ditautkan, bukan kolom yang diedit manual.
-- Satu kantong hanya boleh menjadi sumber satu goal aktif agar progres tidak
-- dihitung dua kali.

create table if not exists "goals" (
	"id" uuid primary key default gen_random_uuid() not null,
	"user_id" uuid not null,
	"name" text not null,
	"target_amount" bigint not null,
	"wallet_id" uuid not null,
	"target_date" timestamp with time zone,
	"note" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone default now() not null,
	"updated_at" timestamp with time zone default now() not null,
	constraint "goals_target_check" check ("goals"."target_amount" > 0)
);

--> statement-breakpoint
alter table "goals"
  drop constraint if exists "goals_wallet_id_fkey";

--> statement-breakpoint
alter table "goals"
  add constraint "goals_wallet_id_fkey"
  foreign key ("wallet_id") references "wallets"("id");

--> statement-breakpoint
create index if not exists "goals_user_idx" on "goals" ("user_id");

--> statement-breakpoint
create index if not exists "goals_wallet_idx" on "goals" ("wallet_id");

--> statement-breakpoint
create unique index if not exists "goals_user_name_uq"
  on "goals" ("user_id", lower("name"))
  where "archived_at" is null;

--> statement-breakpoint
create unique index if not exists "goals_active_wallet_uq"
  on "goals" ("user_id", "wallet_id")
  where "archived_at" is null;

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
    alter table "goals" enable row level security;

    drop policy if exists "goals_owner_all" on "goals";
    create policy "goals_owner_all" on "goals"
      for all to authenticated
      using ("user_id" = (select auth.uid()))
      with check ("user_id" = (select auth.uid()));

    grant select, insert, update, delete on "goals" to authenticated;
  end if;
end
$rls$;
