import { asc, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { issueCreationShortcuts } from "@paperclipai/db";
import type { CreateIssueCreationShortcut, UpdateIssueCreationShortcut } from "@paperclipai/shared";

export function issueCreationShortcutService(db: Db) {
  return {
    list: (companyId: string) =>
      db
        .select()
        .from(issueCreationShortcuts)
        .where(eq(issueCreationShortcuts.companyId, companyId))
        .orderBy(asc(issueCreationShortcuts.sortOrder), asc(issueCreationShortcuts.createdAt)),

    getById: (id: string) =>
      db
        .select()
        .from(issueCreationShortcuts)
        .where(eq(issueCreationShortcuts.id, id))
        .then((rows) => rows[0] ?? null),

    create: (companyId: string, data: CreateIssueCreationShortcut) =>
      db
        .insert(issueCreationShortcuts)
        .values({
          companyId,
          title: data.title,
          description: data.description ?? null,
          sortOrder: data.sortOrder ?? 0,
        })
        .returning()
        .then((rows) => rows[0]),

    update: (id: string, data: UpdateIssueCreationShortcut) =>
      db
        .update(issueCreationShortcuts)
        .set({
          ...(data.title !== undefined && { title: data.title }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
          updatedAt: new Date(),
        })
        .where(eq(issueCreationShortcuts.id, id))
        .returning()
        .then((rows) => rows[0] ?? null),

    remove: (id: string) =>
      db
        .delete(issueCreationShortcuts)
        .where(eq(issueCreationShortcuts.id, id))
        .returning()
        .then((rows) => rows[0] ?? null),
  };
}
