ALTER TABLE "agent_channel_connections" ADD COLUMN "public_id" integer;--> statement-breakpoint
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (PARTITION BY company_id ORDER BY created_at, id) AS next_public_id
  FROM "agent_channel_connections"
)
UPDATE "agent_channel_connections" AS connections
SET "public_id" = ranked.next_public_id
FROM ranked
WHERE connections.id = ranked.id;--> statement-breakpoint
ALTER TABLE "agent_channel_connections" ALTER COLUMN "public_id" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_channel_connections_company_public_id_uq" ON "agent_channel_connections" USING btree ("company_id","public_id");
