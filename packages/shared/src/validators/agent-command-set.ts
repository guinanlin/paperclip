import { z } from "zod";

export const createAgentCommandSetSchema = z.object({
  title: z.string().min(1, "Title is required"),
  body: z.string().optional().nullable(),
  sortOrder: z.number().int().optional().default(0),
});

export type CreateAgentCommandSet = z.infer<typeof createAgentCommandSetSchema>;

export const updateAgentCommandSetSchema = createAgentCommandSetSchema.partial();

export type UpdateAgentCommandSet = z.infer<typeof updateAgentCommandSetSchema>;
