import { z } from "zod";

export const createCompanySkillSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-z0-9][a-z0-9_-]*$/i, "slug must be alphanumeric with _ or -"),
  name: z.string().min(1).max(256),
  description: z.string().max(4000).optional().nullable(),
  sourceType: z.string().max(64).optional().default("manual"),
});

export const updateCompanySkillSchema = z.object({
  name: z.string().min(1).max(256).optional(),
  description: z.string().max(4000).optional().nullable(),
  sourceType: z.string().max(64).optional(),
});

export const attachAgentSkillSchema = z.object({
  skillSlug: z.string().min(1).max(128),
});

export type CreateCompanySkill = z.infer<typeof createCompanySkillSchema>;
export type UpdateCompanySkill = z.infer<typeof updateCompanySkillSchema>;
export type AttachAgentSkill = z.infer<typeof attachAgentSkillSchema>;
