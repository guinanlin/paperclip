import { Router } from "express";
import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents } from "@paperclipai/db";
import {
  attachAgentSkillSchema,
  createCompanySkillSchema,
  updateCompanySkillSchema,
} from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { logActivity, skillService } from "../services/index.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";
import { getServerAdapter } from "../adapters/registry.js";

export function skillRoutes(db: Db) {
  const router = Router();
  const skills = skillService(db);

  router.get("/companies/:companyId/skills", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const rows = await skills.listCompanySkills(companyId);
    res.json(rows);
  });

  router.post("/companies/:companyId/skills", validate(createCompanySkillSchema), async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const row = await skills.createCompanySkill(companyId, req.body);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "company.skill_created",
      entityType: "company_skill",
      entityId: row.id,
      details: { slug: row.slug, name: row.name },
    });
    res.status(201).json(row);
  });

  router.patch(
    "/companies/:companyId/skills/:skillId",
    validate(updateCompanySkillSchema),
    async (req, res) => {
      assertBoard(req);
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      const skillId = req.params.skillId as string;
      const row = await skills.updateCompanySkill(companyId, skillId, req.body);
      if (!row) {
        res.status(404).json({ error: "Skill not found" });
        return;
      }
      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: "company.skill_updated",
        entityType: "company_skill",
        entityId: skillId,
        details: req.body,
      });
      res.json(row);
    },
  );

  router.delete("/companies/:companyId/skills/:skillId", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const skillId = req.params.skillId as string;
    const row = await skills.deleteCompanySkill(companyId, skillId);
    if (!row) {
      res.status(404).json({ error: "Skill not found" });
      return;
    }
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "company.skill_deleted",
      entityType: "company_skill",
      entityId: skillId,
      details: { slug: row.slug },
    });
    res.json({ ok: true });
  });

  router.get("/companies/:companyId/agents/:agentId/skill-attachments", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const agentId = req.params.agentId as string;
    const rows = await skills.listAgentAttachments(companyId, agentId);
    res.json(rows);
  });

  router.post(
    "/companies/:companyId/agents/:agentId/skill-attachments",
    validate(attachAgentSkillSchema),
    async (req, res) => {
      assertBoard(req);
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      const agentId = req.params.agentId as string;
      const row = await skills.attachAgentSkill(companyId, agentId, req.body.skillSlug);
      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId ?? agentId,
        action: "agent.skill_attached",
        entityType: "agent",
        entityId: agentId,
        details: { skillSlug: row.skillSlug },
      });
      res.status(201).json(row);
    },
  );

  router.delete("/companies/:companyId/agents/:agentId/skill-attachments/:skillSlug", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const agentId = req.params.agentId as string;
    const skillSlug = req.params.skillSlug as string;
    const row = await skills.detachAgentSkill(companyId, agentId, skillSlug);
    if (!row) {
      res.status(404).json({ error: "Attachment not found" });
      return;
    }
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId ?? agentId,
      action: "agent.skill_detached",
      entityType: "agent",
      entityId: agentId,
      details: { skillSlug: row.skillSlug },
    });
    res.json({ ok: true });
  });

  router.get("/companies/:companyId/agents/:agentId/skills/sync-state", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const agentId = req.params.agentId as string;

    const agentRow = await db
      .select()
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.companyId, companyId)))
      .then((r) => r[0] ?? null);
    if (!agentRow) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    const desiredSlugs = await skills.getDesiredSlugs(companyId, agentId);
    const adapter = getServerAdapter(agentRow.adapterType ?? "process");
    const noopLog = async () => {};

    if (!adapter.listSkills) {
      res.json({
        mode: "unsupported" as const,
        adapterType: agentRow.adapterType,
        desiredSlugs,
        entries: [],
        message: "This adapter does not support skill discovery on this server.",
      });
      return;
    }

    const snapshot = await adapter.listSkills({
      agent: {
        id: agentRow.id,
        companyId: agentRow.companyId,
        name: agentRow.name,
        adapterType: agentRow.adapterType,
        adapterConfig: agentRow.adapterConfig ?? {},
      },
      config: (agentRow.adapterConfig as Record<string, unknown>) ?? {},
      onLog: noopLog,
      desiredSlugs,
    });

    res.json({
      ...snapshot,
      adapterType: agentRow.adapterType,
      desiredSlugs,
    });
  });

  router.post("/companies/:companyId/agents/:agentId/skills/sync", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const agentId = req.params.agentId as string;

    const agentRow = await db
      .select()
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.companyId, companyId)))
      .then((r) => r[0] ?? null);
    if (!agentRow) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    const desiredSlugs = await skills.getDesiredSlugs(companyId, agentId);
    const adapter = getServerAdapter(agentRow.adapterType ?? "process");
    const noopLog = async () => {};

    if (!adapter.syncSkills) {
      res.status(422).json({ error: "This adapter does not support skill sync on this server." });
      return;
    }

    const snapshot = await adapter.syncSkills({
      agent: {
        id: agentRow.id,
        companyId: agentRow.companyId,
        name: agentRow.name,
        adapterType: agentRow.adapterType,
        adapterConfig: agentRow.adapterConfig ?? {},
      },
      config: (agentRow.adapterConfig as Record<string, unknown>) ?? {},
      onLog: noopLog,
      desiredSlugs,
    });

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId ?? agentId,
      action: "agent.skills_synced",
      entityType: "agent",
      entityId: agentId,
      details: { desiredCount: desiredSlugs.length },
    });

    res.json(snapshot);
  });

  return router;
}
