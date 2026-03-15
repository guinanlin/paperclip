import { pgTable, uuid, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { agents } from "./agents.js";
import { companies } from "./companies.js";

/**
 * Agent-scoped command set: preset instructions that create an Issue and assign to the agent when executed.
 * Company scope is denormalized from agent for access checks.
 */
export const agentCommandSets = pgTable(
  "agent_command_sets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    title: text("title").notNull(),
    body: text("body"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    agentIdIdx: index("agent_command_sets_agent_id_idx").on(table.agentId),
    companyIdIdx: index("agent_command_sets_company_id_idx").on(table.companyId),
  }),
);
