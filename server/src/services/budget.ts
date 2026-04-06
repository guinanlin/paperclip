import { and, eq, gte, lt, ne, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  agents,
  approvals,
  budgetIncidents,
  budgetPolicies,
  costEvents,
  projects,
} from "@paperclipai/db";
import { unprocessable } from "../errors.js";

const EXCLUDE_BILLING = "subscription_included";
const LIFETIME_WINDOW_START = new Date(Date.UTC(1970, 0, 1, 0, 0, 0, 0));

function utcMonthBounds(ref: Date) {
  const y = ref.getUTCFullYear();
  const m = ref.getUTCMonth();
  return {
    start: new Date(Date.UTC(y, m, 1, 0, 0, 0, 0)),
    end: new Date(Date.UTC(y, m + 1, 1, 0, 0, 0, 0)),
  };
}

async function sumBilledCents(
  db: Db,
  companyId: string,
  opts: { agentId?: string | null; projectId?: string | null; from?: Date; to?: Date },
): Promise<number> {
  const conditions = [eq(costEvents.companyId, companyId), ne(costEvents.billingType, EXCLUDE_BILLING)];
  if (opts.from) conditions.push(gte(costEvents.occurredAt, opts.from));
  if (opts.to) conditions.push(lt(costEvents.occurredAt, opts.to));
  if (opts.agentId) conditions.push(eq(costEvents.agentId, opts.agentId));
  if (opts.projectId) conditions.push(eq(costEvents.projectId, opts.projectId));
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${costEvents.costCents}), 0)::int` })
    .from(costEvents)
    .where(and(...conditions));
  return Number(row?.total ?? 0);
}

function policyMatchesEvent(
  policy: typeof budgetPolicies.$inferSelect,
  eventAgentId: string,
  eventProjectId: string | null | undefined,
): boolean {
  if (policy.scopeType === "company") return true;
  if (policy.scopeType === "agent") return policy.scopeId === eventAgentId;
  if (policy.scopeType === "project") {
    return eventProjectId != null && policy.scopeId === eventProjectId;
  }
  return false;
}

export function budgetService(db: Db) {
  return {
    listPolicies: (companyId: string) =>
      db
        .select()
        .from(budgetPolicies)
        .where(eq(budgetPolicies.companyId, companyId)),

    async createPolicy(
      companyId: string,
      input: {
        scopeType: string;
        scopeId?: string | null;
        metric?: string;
        windowKind: string;
        amount: number;
        warnPercent?: number;
        hardStopEnabled?: boolean;
        notifyEnabled?: boolean;
        isActive?: boolean;
        createdByUserId?: string | null;
      },
    ) {
      if (
        (input.scopeType === "agent" || input.scopeType === "project") &&
        !input.scopeId
      ) {
        throw unprocessable("scopeId is required for agent and project policies");
      }
      if (input.scopeType === "company" && input.scopeId) {
        throw unprocessable("company scope must not include scopeId");
      }
      const [row] = await db
        .insert(budgetPolicies)
        .values({
          companyId,
          scopeType: input.scopeType,
          scopeId: input.scopeId ?? null,
          metric: input.metric ?? "billed_cents",
          windowKind: input.windowKind,
          amount: input.amount,
          warnPercent: input.warnPercent ?? 80,
          hardStopEnabled: input.hardStopEnabled ?? true,
          notifyEnabled: input.notifyEnabled ?? true,
          isActive: input.isActive ?? true,
          createdByUserId: input.createdByUserId ?? null,
          updatedByUserId: input.createdByUserId ?? null,
          updatedAt: new Date(),
        })
        .returning();
      return row;
    },

    async updatePolicy(
      companyId: string,
      policyId: string,
      patch: Partial<{
        scopeType: string;
        scopeId: string | null;
        metric: string;
        windowKind: string;
        amount: number;
        warnPercent: number;
        hardStopEnabled: boolean;
        notifyEnabled: boolean;
        isActive: boolean;
        updatedByUserId: string | null;
      }>,
    ) {
      const existing = await db
        .select()
        .from(budgetPolicies)
        .where(and(eq(budgetPolicies.id, policyId), eq(budgetPolicies.companyId, companyId)))
        .then((r) => r[0] ?? null);
      if (!existing) return null;
      const scopeType = patch.scopeType ?? existing.scopeType;
      const scopeId =
        patch.scopeId !== undefined ? patch.scopeId : existing.scopeId;
      if ((scopeType === "agent" || scopeType === "project") && !scopeId) {
        throw unprocessable("scopeId is required for agent and project policies");
      }
      if (scopeType === "company" && scopeId) {
        throw unprocessable("company scope must not include scopeId");
      }
      const [row] = await db
        .update(budgetPolicies)
        .set({
          ...("scopeType" in patch && patch.scopeType !== undefined ? { scopeType: patch.scopeType } : {}),
          ...("scopeId" in patch ? { scopeId: patch.scopeId } : {}),
          ...("metric" in patch && patch.metric !== undefined ? { metric: patch.metric } : {}),
          ...("windowKind" in patch && patch.windowKind !== undefined ? { windowKind: patch.windowKind } : {}),
          ...("amount" in patch && patch.amount !== undefined ? { amount: patch.amount } : {}),
          ...("warnPercent" in patch && patch.warnPercent !== undefined ? { warnPercent: patch.warnPercent } : {}),
          ...("hardStopEnabled" in patch && patch.hardStopEnabled !== undefined
            ? { hardStopEnabled: patch.hardStopEnabled }
            : {}),
          ...("notifyEnabled" in patch && patch.notifyEnabled !== undefined
            ? { notifyEnabled: patch.notifyEnabled }
            : {}),
          ...("isActive" in patch && patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
          ...(patch.updatedByUserId !== undefined ? { updatedByUserId: patch.updatedByUserId } : {}),
          updatedAt: new Date(),
        })
        .where(eq(budgetPolicies.id, policyId))
        .returning();
      return row ?? null;
    },

    async deletePolicy(companyId: string, policyId: string) {
      const existing = await db
        .select()
        .from(budgetPolicies)
        .where(and(eq(budgetPolicies.id, policyId), eq(budgetPolicies.companyId, companyId)))
        .then((r) => r[0] ?? null);
      if (!existing) return null;
      const incs = await db.select().from(budgetIncidents).where(eq(budgetIncidents.policyId, policyId));
      const approvalIds = new Set(
        incs.map((i) => i.approvalId).filter((x): x is string => typeof x === "string" && x.length > 0),
      );
      await db.delete(budgetIncidents).where(eq(budgetIncidents.policyId, policyId));
      for (const aid of approvalIds) {
        await db.delete(approvals).where(eq(approvals.id, aid));
      }
      await db.delete(budgetPolicies).where(eq(budgetPolicies.id, policyId));
      return existing;
    },

    async evaluateAfterCostEvent(event: typeof costEvents.$inferSelect) {
      if (event.billingType === EXCLUDE_BILLING) return;

      const policies = await db
        .select()
        .from(budgetPolicies)
        .where(and(eq(budgetPolicies.companyId, event.companyId), eq(budgetPolicies.isActive, true)));

      const refTime = new Date(event.occurredAt);

      for (const p of policies) {
        if (!policyMatchesEvent(p, event.agentId, event.projectId)) continue;
        if (p.metric !== "billed_cents") continue;

        let observed = 0;
        let windowStart = LIFETIME_WINDOW_START;
        let windowEnd: Date | null = null;

        if (p.windowKind === "calendar_month") {
          const { start, end } = utcMonthBounds(refTime);
          windowStart = start;
          windowEnd = end;
          if (p.scopeType === "company") {
            observed = await sumBilledCents(db, event.companyId, { from: start, to: end });
          } else if (p.scopeType === "agent") {
            observed = await sumBilledCents(db, event.companyId, {
              agentId: p.scopeId!,
              from: start,
              to: end,
            });
          } else {
            observed = await sumBilledCents(db, event.companyId, {
              projectId: p.scopeId!,
              from: start,
              to: end,
            });
          }
        } else if (p.windowKind === "lifetime") {
          windowStart = LIFETIME_WINDOW_START;
          windowEnd = null;
          if (p.scopeType === "project") {
            const proj = await db
              .select({ spent: projects.spentLifetimeCents })
              .from(projects)
              .where(and(eq(projects.id, p.scopeId!), eq(projects.companyId, event.companyId)))
              .then((r) => r[0] ?? null);
            observed = proj?.spent ?? 0;
          } else if (p.scopeType === "agent") {
            observed = await sumBilledCents(db, event.companyId, { agentId: p.scopeId! });
          } else {
            observed = await sumBilledCents(db, event.companyId, {});
          }
        } else {
          continue;
        }

        const warnAt = Math.floor((p.amount * p.warnPercent) / 100);
        const hardAt = p.amount;

        if (observed >= hardAt) {
          let pauseAgentId: string | null = null;
          let pauseProjectId: string | null = null;
          if (p.scopeType === "project") pauseProjectId = p.scopeId;
          else if (p.scopeType === "agent") pauseAgentId = p.scopeId;
          else pauseAgentId = event.agentId;

          await upsertThreshold(db, p, {
            companyId: event.companyId,
            thresholdType: "hard",
            windowStart,
            windowEnd,
            amountLimit: p.amount,
            amountObserved: observed,
            pauseAgentId,
            pauseProjectId,
            eventAgentId: event.agentId,
          });
        } else if (observed >= warnAt) {
          await upsertThreshold(db, p, {
            companyId: event.companyId,
            thresholdType: "warn",
            windowStart,
            windowEnd,
            amountLimit: p.amount,
            amountObserved: observed,
            pauseAgentId: null,
            pauseProjectId: null,
            eventAgentId: event.agentId,
          });
        }
      }
    },

    async applyBudgetOverrideApproval(approval: typeof approvals.$inferSelect) {
      if (approval.type !== "budget_override_required") return;
      const payload = approval.payload as Record<string, unknown>;
      const scopeType = typeof payload.scopeType === "string" ? payload.scopeType : null;
      const scopeId = typeof payload.scopeId === "string" ? payload.scopeId : null;
      const affectedAgentId =
        typeof payload.affectedAgentId === "string" ? payload.affectedAgentId : null;

      await db
        .update(budgetIncidents)
        .set({
          status: "resolved",
          resolvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(eq(budgetIncidents.companyId, approval.companyId), eq(budgetIncidents.approvalId, approval.id)),
        );

      if (scopeType === "project" && scopeId) {
        await db
          .update(projects)
          .set({
            pausedAt: null,
            pauseReason: null,
            updatedAt: new Date(),
          })
          .where(and(eq(projects.id, scopeId), eq(projects.companyId, approval.companyId)));
      }
      if (scopeType === "agent" && scopeId) {
        await db
          .update(agents)
          .set({ status: "idle", updatedAt: new Date() })
          .where(and(eq(agents.id, scopeId), eq(agents.companyId, approval.companyId)));
      }
      if (scopeType === "company" && affectedAgentId) {
        await db
          .update(agents)
          .set({ status: "idle", updatedAt: new Date() })
          .where(and(eq(agents.id, affectedAgentId), eq(agents.companyId, approval.companyId)));
      }
    },
  };
}

async function upsertThreshold(
  db: Db,
  policy: typeof budgetPolicies.$inferSelect,
  opts: {
    companyId: string;
    thresholdType: "warn" | "hard";
    windowStart: Date;
    windowEnd: Date | null;
    amountLimit: number;
    amountObserved: number;
    pauseAgentId: string | null;
    pauseProjectId: string | null;
    eventAgentId: string;
  },
) {
  const existing = await db
    .select()
    .from(budgetIncidents)
    .where(
      and(
        eq(budgetIncidents.companyId, opts.companyId),
        eq(budgetIncidents.policyId, policy.id),
        eq(budgetIncidents.thresholdType, opts.thresholdType),
        eq(budgetIncidents.windowStart, opts.windowStart),
        eq(budgetIncidents.status, "open"),
      ),
    )
    .then((r) => r[0] ?? null);

  if (existing) {
    await db
      .update(budgetIncidents)
      .set({
        amountObserved: opts.amountObserved,
        updatedAt: new Date(),
      })
      .where(eq(budgetIncidents.id, existing.id));
    return;
  }

  let approvalId: string | null = null;

  if (opts.thresholdType === "hard" && policy.hardStopEnabled) {
    if (opts.pauseProjectId) {
      await db
        .update(projects)
        .set({
          pausedAt: new Date(),
          pauseReason: "budget_exceeded",
          updatedAt: new Date(),
        })
        .where(
          and(eq(projects.id, opts.pauseProjectId), eq(projects.companyId, opts.companyId)),
        );
    }
    if (opts.pauseAgentId) {
      const ag = await db
        .select()
        .from(agents)
        .where(and(eq(agents.id, opts.pauseAgentId), eq(agents.companyId, opts.companyId)))
        .then((r) => r[0] ?? null);
      if (ag && ag.status !== "terminated" && ag.status !== "pending_approval") {
        await db
          .update(agents)
          .set({ status: "paused", updatedAt: new Date() })
          .where(eq(agents.id, opts.pauseAgentId));
      }
    }

    const [appr] = await db
      .insert(approvals)
      .values({
        companyId: opts.companyId,
        type: "budget_override_required",
        status: "pending",
        payload: {
          policyId: policy.id,
          scopeType: policy.scopeType,
          scopeId: policy.scopeId,
          windowStart: opts.windowStart.toISOString(),
          windowKind: policy.windowKind,
          thresholdType: "hard",
          affectedAgentId:
            policy.scopeType === "company" ? opts.eventAgentId : null,
        },
        requestedByAgentId: null,
        requestedByUserId: null,
        updatedAt: new Date(),
      })
      .returning();
    approvalId = appr?.id ?? null;
  }

  await db.insert(budgetIncidents).values({
    companyId: opts.companyId,
    policyId: policy.id,
    scopeType: policy.scopeType,
    scopeId: policy.scopeId,
    metric: policy.metric,
    windowKind: policy.windowKind,
    windowStart: opts.windowStart,
    windowEnd: opts.windowEnd,
    thresholdType: opts.thresholdType,
    amountLimit: opts.amountLimit,
    amountObserved: opts.amountObserved,
    status: "open",
    approvalId,
    activityId: null,
    resolvedAt: null,
    updatedAt: new Date(),
  });
}
