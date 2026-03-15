CREATE TABLE "issue_creation_shortcuts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "issue_creation_shortcuts" ADD CONSTRAINT "issue_creation_shortcuts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "issue_creation_shortcuts_company_idx" ON "issue_creation_shortcuts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "issue_creation_shortcuts_company_sort_idx" ON "issue_creation_shortcuts" USING btree ("company_id","sort_order");