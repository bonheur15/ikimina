CREATE TABLE "finance_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"amount" integer NOT NULL,
	"msisdn" text NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"interest_amount" integer,
	"repayment_months" integer,
	"review_note" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"terms_accepted_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mobile_payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"member_id" uuid NOT NULL,
	"request_id" uuid,
	"purpose" text NOT NULL,
	"direction" text NOT NULL,
	"amount" integer NOT NULL,
	"fee" integer DEFAULT 0 NOT NULL,
	"msisdn" text NOT NULL,
	"period" char(7),
	"description" text NOT NULL,
	"mode" text NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"provider_id" uuid,
	"failure_message" text,
	"created_by" uuid NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mobile_payments_provider_id_unique" UNIQUE("provider_id")
);
--> statement-breakpoint
CREATE TABLE "payment_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "penalty_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" varchar(40) NOT NULL,
	"member_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"period" char(7) NOT NULL,
	"assessed_on" date NOT NULL,
	"reason" text NOT NULL,
	"recorded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by" uuid,
	"void_reason" text,
	CONSTRAINT "penalty_assessments_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "penalty_assessment_id" uuid;--> statement-breakpoint
ALTER TABLE "finance_requests" ADD CONSTRAINT "finance_requests_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_requests" ADD CONSTRAINT "finance_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mobile_payments" ADD CONSTRAINT "mobile_payments_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mobile_payments" ADD CONSTRAINT "mobile_payments_request_id_finance_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."finance_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mobile_payments" ADD CONSTRAINT "mobile_payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "penalty_assessments" ADD CONSTRAINT "penalty_assessments_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "penalty_assessments" ADD CONSTRAINT "penalty_assessments_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "penalty_assessments" ADD CONSTRAINT "penalty_assessments_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "finance_request_member" ON "finance_requests" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "mobile_payment_member" ON "mobile_payments" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "mobile_payment_request" ON "mobile_payments" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "penalty_assessment_member" ON "penalty_assessments" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "penalty_assessment_period" ON "penalty_assessments" USING btree ("period");--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_penalty_assessment_id_penalty_assessments_id_fk" FOREIGN KEY ("penalty_assessment_id") REFERENCES "public"."penalty_assessments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ledger_penalty_assessment" ON "ledger_entries" USING btree ("penalty_assessment_id");