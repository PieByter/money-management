-- 0008: pagu budget total bulanan per user.
--
-- Budget per kategori tetap di tabel `budgets`. Tabel ini hanya menyimpan satu
-- angka opsional: batas belanja total sebulan. Progres dan "sisa aman per hari"
-- dihitung dari ledger, bukan disimpan.

create table if not exists "budget_settings" (
	"user_id" uuid primary key not null,
	"monthly_budget" bigint not null,
	"updated_at" timestamp with time zone default now() not null,
	constraint "budget_settings_amount_check" check ("budget_settings"."monthly_budget" > 0)
);

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
    alter table "budget_settings" enable row level security;

    drop policy if exists "budget_settings_owner_all" on "budget_settings";
    create policy "budget_settings_owner_all" on "budget_settings"
      for all to authenticated
      using ("user_id" = (select auth.uid()))
      with check ("user_id" = (select auth.uid()));

    grant select, insert, update, delete on "budget_settings" to authenticated;
  end if;
end
$rls$;
