CREATE TABLE "loan_backings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"is_borrower" boolean DEFAULT false NOT NULL,
	"mode" text NOT NULL,
	"released_amount" integer DEFAULT 0 NOT NULL,
	"decided_at" timestamp with time zone,
	"funded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'member'::text;--> statement-breakpoint
UPDATE "users" SET "role" = 'secretary' WHERE "role" = 'admin';--> statement-breakpoint
DROP TYPE "public"."user_role";--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('superadmin', 'secretary', 'manager', 'member');--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'member'::"public"."user_role";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DATA TYPE "public"."user_role" USING "role"::"public"."user_role";--> statement-breakpoint
ALTER TABLE "finance_requests" ADD COLUMN "loan_type" text;--> statement-breakpoint
ALTER TABLE "finance_requests" ADD COLUMN "loan_terms" jsonb;--> statement-breakpoint
ALTER TABLE "loan_backings" ADD CONSTRAINT "loan_backings_request_id_finance_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."finance_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_backings" ADD CONSTRAINT "loan_backings_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "loan_backing_member_request" ON "loan_backings" USING btree ("request_id","member_id");--> statement-breakpoint
CREATE INDEX "loan_backing_member" ON "loan_backings" USING btree ("member_id");