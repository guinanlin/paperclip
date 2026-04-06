import { pgTable, uuid, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";
import { companySkills } from "./company_skills.js";

export const agentSkillAttachments = pgTable(
  "agent_skill_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    agentId: uuid("agent_id").notNull().references(() => agents.id),
    skillSlug: text("skill_slug").notNull(),
    companySkillId: uuid("company_skill_id").references(() => companySkills.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    agentSlugUq: uniqueIndex("agent_skill_attachments_agent_slug_uq").on(table.agentId, table.skillSlug),
    agentIdx: index("agent_skill_attachments_agent_idx").on(table.agentId),
    companyIdx: index("agent_skill_attachments_company_idx").on(table.companyId),
  }),
);
