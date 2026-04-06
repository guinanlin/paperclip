import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { budgetIncidents } from "@paperclipai/db";
import { createBudgetPolicySchema, updateBudgetPolicySchema } from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { budgetService, logActivity } from "../services/index.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";

export function budgetRoutes(db: Db) {
  const router = Router();
  const budgets = budgetService(db);

  router.get("/companies/:companyId/budget-policies", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const rows = await budgets.listPolicies(companyId);
    res.json(rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()));
  });

  router.post("/companies/:companyId/budget-policies", validate(createBudgetPolicySchema), async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const actor = getActorInfo(req);
    const row = await budgets.createPolicy(companyId, {
      ...req.body,
      createdByUserId: actor.actorType === "user" ? actor.actorId : null,
    });
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "company.budget_policy_created",
      entityType: "budget_policy",
      entityId: row.id,
      details: { scopeType: row.scopeType, windowKind: row.windowKind, amount: row.amount },
    });
    res.status(201).json(row);
  });

  router.patch(
    "/companies/:companyId/budget-policies/:policyId",
    validate(updateBudgetPolicySchema),
    async (req, res) => {
      assertBoard(req);
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      const policyId = req.params.policyId as string;
      const actor = getActorInfo(req);
      const row = await budgets.updatePolicy(companyId, policyId, {
        ...req.body,
        updatedByUserId: actor.actorType === "user" ? actor.actorId : null,
      });
      if (!row) {
        res.status(404).json({ error: "Policy not found" });
        return;
      }
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: "company.budget_policy_updated",
        entityType: "budget_policy",
        entityId: policyId,
        details: req.body,
      });
      res.json(row);
    },
  );

  router.delete("/companies/:companyId/budget-policies/:policyId", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const policyId = req.params.policyId as string;
    const row = await budgets.deletePolicy(companyId, policyId);
    if (!row) {
      res.status(404).json({ error: "Policy not found" });
      return;
    }
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "company.budget_policy_deleted",
      entityType: "budget_policy",
      entityId: policyId,
      details: {},
    });
    res.json({ ok: true });
  });

  router.get("/companies/:companyId/budget-incidents", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const conditions = [eq(budgetIncidents.companyId, companyId)];
    if (status) conditions.push(eq(budgetIncidents.status, status));
    const rows = await db
      .select()
      .from(budgetIncidents)
      .where(and(...conditions))
      .orderBy(desc(budgetIncidents.createdAt));
    res.json(rows);
  });

  return router;
}
