import { z } from "zod";

export const BUDGET_POLICY_SCOPE_TYPES = ["company", "agent", "project"] as const;
export const BUDGET_POLICY_WINDOW_KINDS = ["calendar_month", "lifetime"] as const;

export const createBudgetPolicySchema = z.object({
  scopeType: z.enum(BUDGET_POLICY_SCOPE_TYPES),
  scopeId: z.string().uuid().nullable().optional(),
  metric: z.literal("billed_cents").optional().default("billed_cents"),
  windowKind: z.enum(BUDGET_POLICY_WINDOW_KINDS),
  amount: z.number().int().positive(),
  warnPercent: z.number().int().min(1).max(100).optional().default(80),
  hardStopEnabled: z.boolean().optional().default(true),
  notifyEnabled: z.boolean().optional().default(true),
  isActive: z.boolean().optional().default(true),
});

export const updateBudgetPolicySchema = createBudgetPolicySchema.partial();

export type CreateBudgetPolicyInput = z.infer<typeof createBudgetPolicySchema>;
export type UpdateBudgetPolicyInput = z.infer<typeof updateBudgetPolicySchema>;
