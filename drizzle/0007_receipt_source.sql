-- 0007: sumber transaksi 'receipt' untuk hasil scan struk AI.
-- Metadata scan (provider, model, confidence, item ringkas) disimpan di
-- transactions.raw_input; foto struk tidak disimpan di database.

alter table "transactions" drop constraint if exists "transactions_source_check";

--> statement-breakpoint
alter table "transactions"
  add constraint "transactions_source_check"
  check ("source" in ('web','telegram','whatsapp','import','template','receipt'));
