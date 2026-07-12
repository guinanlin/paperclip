CREATE TABLE "agent_channel_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"channel" text DEFAULT 'android' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"display_name" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_channel_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"channel" text DEFAULT 'android' NOT NULL,
	"device_id" text NOT NULL,
	"device_name" text,
	"device_token_hash" text NOT NULL,
	"app_version" text,
	"last_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_channel_pair_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"login_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"confirmed_at" timestamp with time zone,
	"confirmed_device_record_id" uuid,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_channel_peers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"device_record_id" uuid NOT NULL,
	"peer_id" text NOT NULL,
	"peer_label" text,
	"issue_id" uuid,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_channel_connections" ADD CONSTRAINT "agent_channel_connections_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_channel_connections" ADD CONSTRAINT "agent_channel_connections_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_channel_devices" ADD CONSTRAINT "agent_channel_devices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_channel_devices" ADD CONSTRAINT "agent_channel_devices_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_channel_devices" ADD CONSTRAINT "agent_channel_devices_connection_id_agent_channel_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."agent_channel_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_channel_pair_sessions" ADD CONSTRAINT "agent_channel_pair_sessions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_channel_pair_sessions" ADD CONSTRAINT "agent_channel_pair_sessions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_channel_pair_sessions" ADD CONSTRAINT "agent_channel_pair_sessions_connection_id_agent_channel_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."agent_channel_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_channel_peers" ADD CONSTRAINT "agent_channel_peers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_channel_peers" ADD CONSTRAINT "agent_channel_peers_device_record_id_agent_channel_devices_id_fk" FOREIGN KEY ("device_record_id") REFERENCES "public"."agent_channel_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_channel_connections_company_agent_idx" ON "agent_channel_connections" USING btree ("company_id","agent_id","channel");--> statement-breakpoint
CREATE INDEX "agent_channel_devices_company_agent_idx" ON "agent_channel_devices" USING btree ("company_id","agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_channel_devices_connection_device_uq" ON "agent_channel_devices" USING btree ("connection_id","device_id");--> statement-breakpoint
CREATE INDEX "agent_channel_devices_token_hash_idx" ON "agent_channel_devices" USING btree ("device_token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_channel_pair_sessions_login_id_uq" ON "agent_channel_pair_sessions" USING btree ("login_id");--> statement-breakpoint
CREATE INDEX "agent_channel_pair_sessions_company_agent_idx" ON "agent_channel_pair_sessions" USING btree ("company_id","agent_id");--> statement-breakpoint
CREATE INDEX "agent_channel_pair_sessions_connection_idx" ON "agent_channel_pair_sessions" USING btree ("connection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_channel_peers_device_peer_uq" ON "agent_channel_peers" USING btree ("device_record_id","peer_id");--> statement-breakpoint
CREATE INDEX "agent_channel_peers_company_idx" ON "agent_channel_peers" USING btree ("company_id");