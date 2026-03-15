import { z } from "zod";

export const createIssueCreationShortcutSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional().nullable(),
  sortOrder: z.number().int().optional().default(0),
});

export type CreateIssueCreationShortcut = z.infer<typeof createIssueCreationShortcutSchema>;

export const updateIssueCreationShortcutSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  sortOrder: z.number().int().optional(),
});

export type UpdateIssueCreationShortcut = z.infer<typeof updateIssueCreationShortcutSchema>;
