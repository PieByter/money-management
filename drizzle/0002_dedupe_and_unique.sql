-- 0002: bersihkan duplikat hasil seed ganda & cegah terulang.
--
-- Konteks: ensureDefaults bisa berjalan paralel saat login pertama sehingga
-- kategori default ter-insert dua kali. Migrasi ini:
--   1) menyatukan kategori duplikat (user_id, kind, lower(name)),
--   2) menyatukan kantong duplikat (user_id, lower(name)),
--   3) menambah unique index parsial agar tidak bisa terjadi lagi.

-- 1) Kategori: pindahkan transaksi ke baris yang dipertahankan, lalu hapus duplikat.
do $dedupe_categories$
declare
  grp record;
  keeper uuid;
begin
  if to_regclass('public.categories') is null then
    return;
  end if;

  for grp in
    select user_id, kind, lower(name) as lname
    from categories
    where archived_at is null
    group by user_id, kind, lower(name)
    having count(*) > 1
  loop
    select id into keeper
    from categories
    where user_id = grp.user_id
      and kind = grp.kind
      and lower(name) = grp.lname
      and archived_at is null
    order by sort_order nulls last, created_at, id
    limit 1;

    update transactions t
    set category_id = keeper
    where t.category_id in (
      select id from categories
      where user_id = grp.user_id
        and kind = grp.kind
        and lower(name) = grp.lname
        and archived_at is null
        and id <> keeper
    );

    delete from categories
    where user_id = grp.user_id
      and kind = grp.kind
      and lower(name) = grp.lname
      and archived_at is null
      and id <> keeper;
  end loop;
end;
$dedupe_categories$;

--> statement-breakpoint
-- 2) Kantong: sama, transaksi diarahkan ke kantong yang dipertahankan.
do $dedupe_wallets$
declare
  grp record;
  keeper uuid;
begin
  if to_regclass('public.wallets') is null then
    return;
  end if;

  for grp in
    select user_id, lower(name) as lname
    from wallets
    where archived_at is null
    group by user_id, lower(name)
    having count(*) > 1
  loop
    select id into keeper
    from wallets
    where user_id = grp.user_id and lower(name) = grp.lname and archived_at is null
    order by sort_order nulls last, created_at, id
    limit 1;

    update transactions t
    set wallet_id = keeper
    where t.wallet_id in (
      select id from wallets
      where user_id = grp.user_id and lower(name) = grp.lname and archived_at is null and id <> keeper
    );

    delete from wallets
    where user_id = grp.user_id
      and lower(name) = grp.lname
      and archived_at is null
      and id <> keeper;
  end loop;
end;
$dedupe_wallets$;

--> statement-breakpoint
-- 3) Cegah duplikat baru (index parsial mengabaikan baris yang diarsipkan).
create unique index if not exists categories_user_kind_name_uq
  on categories (user_id, kind, lower(name))
  where archived_at is null;

--> statement-breakpoint
create unique index if not exists wallets_user_name_uq
  on wallets (user_id, lower(name))
  where archived_at is null;
