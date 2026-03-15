import { pgTable, uuid, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

/**
 * Issue creation shortcuts: reusable templates for the New Issue dialog.
 * Company-scoped; at least title, optional description. Used to fill form on click.
 */
export const issueCreationShortcuts = pgTable(
  "issue_creation_shortcuts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("issue_creation_shortcuts_company_idx").on(table.companyId),
    companySortIdx: index("issue_creation_shortcuts_company_sort_idx").on(
      table.companyId,
      table.sortOrder,
    ),
  }),
);
