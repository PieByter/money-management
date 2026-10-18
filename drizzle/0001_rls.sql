-- RLS sebagai garis pertahanan utama (PRD 7.2g).
-- Migrasi ini hanya berlaku di lingkungan Supabase (ada role `authenticated`
-- dan fungsi `auth.uid()`). Di PGlite/Postgres lokal blok ini otomatis dilewati.
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
    alter table "wallets" enable row level security;
    alter table "categories" enable row level security;
    alter table "transactions" enable row level security;

    drop policy if exists "wallets_owner_all" on "wallets";
    create policy "wallets_owner_all" on "wallets"
      for all to authenticated
      using ("user_id" = (select auth.uid()))
      with check ("user_id" = (select auth.uid()));

    drop policy if exists "categories_owner_all" on "categories";
    create policy "categories_owner_all" on "categories"
      for all to authenticated
      using ("user_id" = (select auth.uid()))
      with check ("user_id" = (select auth.uid()));

    drop policy if exists "transactions_owner_all" on "transactions";
    create policy "transactions_owner_all" on "transactions"
      for all to authenticated
      using ("user_id" = (select auth.uid()))
      with check ("user_id" = (select auth.uid()));

    grant usage on schema "public" to authenticated;
    grant select, insert, update, delete on "wallets" to authenticated;
    grant select, insert, update, delete on "categories" to authenticated;
    grant select, insert, update, delete on "transactions" to authenticated;
    grant select on "wallet_balances" to authenticated;
  end if;
end
$rls$;
