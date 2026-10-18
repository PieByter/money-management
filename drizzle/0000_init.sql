CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"icon" text,
	"color" text,
	"sort_order" bigint DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_kind_check" CHECK ("categories"."kind" in ('income','expense'))
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"wallet_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"amount" bigint NOT NULL,
	"category_id" uuid,
	"group_id" uuid,
	"occurred_at" timestamp with time zone NOT NULL,
	"note" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"source" text DEFAULT 'web' NOT NULL,
	"raw_input" text,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"client_request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "transactions_user_client_request_unique" UNIQUE("user_id","client_request_id"),
	CONSTRAINT "transactions_kind_check" CHECK ("transactions"."kind" in ('income','expense','transfer_in','transfer_out','adjustment_in','adjustment_out')),
	CONSTRAINT "transactions_amount_check" CHECK ("transactions"."amount" > 0),
	CONSTRAINT "transactions_source_check" CHECK ("transactions"."source" in ('web','telegram','whatsapp','import')),
	CONSTRAINT "transactions_status_check" CHECK ("transactions"."status" in ('draft','confirmed'))
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"color" text,
	"icon" text,
	"sort_order" bigint DEFAULT 0 NOT NULL,
	"currency" char(3) DEFAULT 'IDR' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallets_type_check" CHECK ("wallets"."type" in ('cash','bank','ewallet','other'))
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "categories_user_kind_idx" ON "categories" USING btree ("user_id","kind");--> statement-breakpoint
CREATE INDEX "transactions_user_occurred_idx" ON "transactions" USING btree ("user_id","occurred_at" DESC NULLS LAST) WHERE "transactions"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "transactions_wallet_occurred_idx" ON "transactions" USING btree ("wallet_id","occurred_at") WHERE "transactions"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "transactions_group_idx" ON "transactions" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "wallets_user_idx" ON "wallets" USING btree ("user_id");--> statement-breakpoint
CREATE VIEW "public"."wallet_balances" WITH (security_invoker = true) AS (select "wallets"."id", "wallets"."user_id", coalesce(sum(
          case "transactions"."kind"
            when 'income' then "transactions"."amount"
            when 'transfer_in' then "transactions"."amount"
            when 'adjustment_in' then "transactions"."amount"
            when 'expense' then -"transactions"."amount"
            when 'transfer_out' then -"transactions"."amount"
            when 'adjustment_out' then -"transactions"."amount"
            else 0
          end
        ), 0)::bigint as "balance" from "wallets" left join "transactions" on "transactions"."wallet_id" = "wallets"."id"
            and "transactions"."deleted_at" is null
            and "transactions"."status" = 'confirmed' group by "wallets"."id", "wallets"."user_id");