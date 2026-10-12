CREATE TABLE "penalty_delay_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"period" char(7) NOT NULL,
	"reason" text NOT NULL,
	"requested_until" date NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"deferred_until" date,
	"review_note" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_key" text NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"path" text NOT NULL,
	"sent_at" timestamp with time zone,
	"attempted_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_notifications_event_key_unique" UNIQUE("event_key")
);
--> statement-breakpoint
CREATE TABLE "savings_penalty_cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"period" char(7) NOT NULL,
	"expected_shares" integer NOT NULL,
	"basis" text DEFAULT 'unpaid' NOT NULL,
	"processed_through" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "penalty_assessments" ALTER COLUMN "recorded_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "penalty_assessments" ADD COLUMN "cycle_id" uuid;--> statement-breakpoint
ALTER TABLE "penalty_assessments" ADD COLUMN "charge_on" date;--> statement-breakpoint
ALTER TABLE "penalty_assessments" ADD COLUMN "charged_shares" integer;--> statement-breakpoint
ALTER TABLE "penalty_delay_requests" ADD CONSTRAINT "penalty_delay_requests_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "penalty_delay_requests" ADD CONSTRAINT "penalty_delay_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_notifications" ADD CONSTRAINT "push_notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_penalty_cycles" ADD CONSTRAINT "savings_penalty_cycles_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "penalty_delay_member_period" ON "penalty_delay_requests" USING btree ("member_id","period");--> statement-breakpoint
CREATE UNIQUE INDEX "savings_penalty_cycle_member_period" ON "savings_penalty_cycles" USING btree ("member_id","period");--> statement-breakpoint
ALTER TABLE "penalty_assessments" ADD CONSTRAINT "penalty_assessments_cycle_id_savings_penalty_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."savings_penalty_cycles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "penalty_cycle_day" ON "penalty_assessments" USING btree ("cycle_id","charge_on");