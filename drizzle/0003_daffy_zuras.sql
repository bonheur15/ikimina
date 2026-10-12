ALTER TABLE "finance_requests" ADD COLUMN "payout_amount" integer;--> statement-breakpoint
ALTER TABLE "finance_requests" ADD COLUMN "quoted_fee" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "finance_requests" ADD COLUMN "fee_policy" text DEFAULT 'group' NOT NULL;--> statement-breakpoint
ALTER TABLE "mobile_payments" ADD COLUMN "account_amount" integer;--> statement-breakpoint
ALTER TABLE "mobile_payments" ADD COLUMN "applied_amount" integer;--> statement-breakpoint
ALTER TABLE "mobile_payments" ADD COLUMN "quoted_fee" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "mobile_payments" ADD COLUMN "fee_policy" text DEFAULT 'group' NOT NULL;