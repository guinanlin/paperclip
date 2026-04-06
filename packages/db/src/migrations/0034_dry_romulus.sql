ALTER TABLE "cost_events" ADD COLUMN "heartbeat_run_id" uuid;--> statement-breakpoint
ALTER TABLE "cost_events" ADD COLUMN "biller" text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "cost_events" ADD COLUMN "billing_type" text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "cost_events" ADD COLUMN "cached_input_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "cost_events" ADD CONSTRAINT "cost_events_heartbeat_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("heartbeat_run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cost_events_company_provider_occurred_idx" ON "cost_events" USING btree ("company_id","provider","occurred_at");--> statement-breakpoint
CREATE INDEX "cost_events_company_biller_occurred_idx" ON "cost_events" USING btree ("company_id","biller","occurred_at");--> statement-breakpoint
CREATE INDEX "cost_events_company_heartbeat_run_idx" ON "cost_events" USING btree ("company_id","heartbeat_run_id");--> statement-breakpoint
UPDATE "cost_events" SET "biller" = "provider";