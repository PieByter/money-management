-- 0010: kanal input eksternal (Fase 2) — tautan chat + log idempotensi.
--
-- `channel_links` memetakan chat Telegram/WhatsApp ke user setelah verifikasi
-- token. `ingest_events` menyimpan setiap pesan dengan unique external id agar
-- webhook yang di-retry tidak membuat transaksi ganda.

create table if not exists "channel_links" (
	"id" uuid primary key default gen_random_uuid() not null,
	"user_id" uuid not null,
	"channel" text default 'telegram' not null,
	"external_chat_id" text not null,
	"verified_at" timestamp with time zone default now() not null,
	"created_at" timestamp with time zone default now() not null,
	constraint "channel_links_channel_check" check ("channel_links"."channel" in ('telegram','whatsapp'))
);

--> statement-breakpoint
create unique index if not exists "channel_links_chat_uq"
  on "channel_links" ("channel", "external_chat_id");

--> statement-breakpoint
create unique index if not exists "channel_links_user_channel_uq"
  on "channel_links" ("user_id", "channel");

--> statement-breakpoint
create index if not exists "channel_links_user_idx" on "channel_links" ("user_id");

--> statement-breakpoint
create table if not exists "channel_link_tokens" (
	"token" text primary key not null,
	"user_id" uuid not null,
	"channel" text default 'telegram' not null,
	"expires_at" timestamp with time zone not null,
	"created_at" timestamp with time zone default now() not null
);

--> statement-breakpoint
create index if not exists "channel_link_tokens_user_idx"
  on "channel_link_tokens" ("user_id");

--> statement-breakpoint
create table if not exists "ingest_events" (
	"id" uuid primary key default gen_random_uuid() not null,
	"user_id" uuid,
	"channel" text default 'telegram' not null,
	"external_message_id" text not null,
	"payload" jsonb not null,
	"parsed" jsonb,
	"status" text default 'received' not null,
	"error" text,
	"created_at" timestamp with time zone default now() not null,
	constraint "ingest_events_status_check" check ("ingest_events"."status" in ('received','processed','error','ignored'))
);

--> statement-breakpoint
create unique index if not exists "ingest_events_message_uq"
  on "ingest_events" ("channel", "external_message_id");

--> statement-breakpoint
create index if not exists "ingest_events_user_idx" on "ingest_events" ("user_id");

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
    alter table "channel_links" enable row level security;
    alter table "channel_link_tokens" enable row level security;
    alter table "ingest_events" enable row level security;

    drop policy if exists "channel_links_owner_all" on "channel_links";
    create policy "channel_links_owner_all" on "channel_links"
      for all to authenticated
      using ("user_id" = (select auth.uid()))
      with check ("user_id" = (select auth.uid()));

    drop policy if exists "channel_link_tokens_owner_all" on "channel_link_tokens";
    create policy "channel_link_tokens_owner_all" on "channel_link_tokens"
      for all to authenticated
      using ("user_id" = (select auth.uid()))
      with check ("user_id" = (select auth.uid()));

    drop policy if exists "ingest_events_owner_select" on "ingest_events";
    create policy "ingest_events_owner_select" on "ingest_events"
      for select to authenticated
      using ("user_id" = (select auth.uid()));

    grant select, insert, update, delete on "channel_links" to authenticated;
    grant select, insert, update, delete on "channel_link_tokens" to authenticated;
    grant select on "ingest_events" to authenticated;
  end if;
end
$rls$;
