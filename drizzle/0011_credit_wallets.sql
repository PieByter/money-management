-- 0011: kantong kartu kredit / paylater.
--
-- Saldo kantong kredit bertanda negatif saat ada tagihan. Pemakaian dicatat
-- sebagai `expense`, pembayaran sebagai transfer dari kantong lain ke kantong
-- ini. Sisa tagihan = -saldo. Limit/statement/due hanya metadata.

alter table "wallets" drop constraint if exists "wallets_type_check";

--> statement-breakpoint
alter table "wallets"
  add constraint "wallets_type_check"
  check ("type" in ('cash','bank','ewallet','other','credit'));

--> statement-breakpoint
alter table "wallets" add column if not exists "credit_limit" bigint;

--> statement-breakpoint
alter table "wallets" add column if not exists "statement_day" smallint;

--> statement-breakpoint
alter table "wallets" add column if not exists "due_day" smallint;

--> statement-breakpoint
alter table "wallets" drop constraint if exists "wallets_credit_limit_check";

--> statement-breakpoint
alter table "wallets"
  add constraint "wallets_credit_limit_check"
  check ("credit_limit" is null or "credit_limit" > 0);

--> statement-breakpoint
alter table "wallets" drop constraint if exists "wallets_statement_day_check";

--> statement-breakpoint
alter table "wallets"
  add constraint "wallets_statement_day_check"
  check ("statement_day" is null or ("statement_day" between 1 and 31));

--> statement-breakpoint
alter table "wallets" drop constraint if exists "wallets_due_day_check";

--> statement-breakpoint
alter table "wallets"
  add constraint "wallets_due_day_check"
  check ("due_day" is null or ("due_day" between 1 and 31));
