CREATE TABLE "contribution_proofs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"member_id" uuid NOT NULL,
	"submitted_by" uuid NOT NULL,
	"kind" text NOT NULL,
	"amount" integer NOT NULL,
	"period" char(7) NOT NULL,
	"paid_at" timestamp with time zone NOT NULL,
	"method" text NOT NULL,
	"payment_reference" text,
	"note" text,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" char(64) NOT NULL,
	"file" "bytea" NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"ledger_entry_id" uuid,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contribution_proofs_ledger_entry_id_unique" UNIQUE("ledger_entry_id")
);
--> statement-breakpoint
ALTER TABLE "contribution_proofs" ADD CONSTRAINT "contribution_proofs_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contribution_proofs" ADD CONSTRAINT "contribution_proofs_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contribution_proofs" ADD CONSTRAINT "contribution_proofs_ledger_entry_id_ledger_entries_id_fk" FOREIGN KEY ("ledger_entry_id") REFERENCES "public"."ledger_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contribution_proofs" ADD CONSTRAINT "contribution_proofs_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contribution_proof_member" ON "contribution_proofs" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "contribution_proof_status" ON "contribution_proofs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "contribution_proof_active_file" ON "contribution_proofs" USING btree ("sha256") WHERE "contribution_proofs"."status" in ('pending', 'approved');--> statement-breakpoint
CREATE UNIQUE INDEX "contribution_proof_active_reference" ON "contribution_proofs" USING btree ("method","payment_reference") WHERE "contribution_proofs"."status" in ('pending', 'approved') and "contribution_proofs"."payment_reference" is not null;