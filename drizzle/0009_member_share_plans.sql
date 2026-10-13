CREATE TABLE "member_share_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"effective_period" char(7) NOT NULL,
	"shares" integer NOT NULL,
	"request_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "share_change_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"current_shares" integer NOT NULL,
	"requested_shares" integer NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"effective_period" char(7),
	"review_note" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "member_share_plans" ADD CONSTRAINT "member_share_plans_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_share_plans" ADD CONSTRAINT "member_share_plans_request_id_share_change_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."share_change_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_share_plans" ADD CONSTRAINT "member_share_plans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_change_requests" ADD CONSTRAINT "share_change_requests_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_change_requests" ADD CONSTRAINT "share_change_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "member_share_plan_period" ON "member_share_plans" USING btree ("member_id","effective_period");--> statement-breakpoint
CREATE INDEX "share_change_request_member" ON "share_change_requests" USING btree ("member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "share_change_request_pending" ON "share_change_requests" USING btree ("member_id") WHERE "share_change_requests"."status" = 'pending';