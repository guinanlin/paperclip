import { Router } from "express";
import type { Db } from "@paperclipai/db";
import {
  createIssueCreationShortcutSchema,
  updateIssueCreationShortcutSchema,
} from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { issueCreationShortcutService, logActivity } from "../services/index.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";

export function issueCreationShortcutRoutes(db: Db) {
  const router = Router();
  const svc = issueCreationShortcutService(db);

  router.get("/companies/:companyId/issue-creation-shortcuts", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const list = await svc.list(companyId);
    res.json(list);
  });

  router.post(
    "/companies/:companyId/issue-creation-shortcuts",
    validate(createIssueCreationShortcutSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      const shortcut = await svc.create(companyId, req.body);
      if (!shortcut) {
        res.status(500).json({ error: "Failed to create shortcut" });
        return;
      }
      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: "issue_creation_shortcut.created",
        entityType: "issue_creation_shortcut",
        entityId: shortcut.id,
        details: { title: shortcut.title },
      });
      res.status(201).json(shortcut);
    },
  );

  router.patch(
    "/issue-creation-shortcuts/:id",
    validate(updateIssueCreationShortcutSchema),
    async (req, res) => {
      const id = req.params.id as string;
      const existing = await svc.getById(id);
      if (!existing) {
        res.status(404).json({ error: "Shortcut not found" });
        return;
      }
      assertCompanyAccess(req, existing.companyId);
      const shortcut = await svc.update(id, req.body);
      if (!shortcut) {
        res.status(404).json({ error: "Shortcut not found" });
        return;
      }
      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId: shortcut.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: "issue_creation_shortcut.updated",
        entityType: "issue_creation_shortcut",
        entityId: shortcut.id,
        details: req.body,
      });
      res.json(shortcut);
    },
  );

  router.delete("/issue-creation-shortcuts/:id", async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Shortcut not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);
    const shortcut = await svc.remove(id);
    if (!shortcut) {
      res.status(404).json({ error: "Shortcut not found" });
      return;
    }
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: shortcut.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "issue_creation_shortcut.deleted",
      entityType: "issue_creation_shortcut",
      entityId: shortcut.id,
      details: { title: shortcut.title },
    });
    res.json(shortcut);
  });

  return router;
}
