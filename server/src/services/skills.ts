import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  agentSkillAttachments,
  agents,
  companySkills,
} from "@paperclipai/db";
import { notFound, unprocessable } from "../errors.js";

function normalizeSlug(slug: string) {
  return slug.trim().toLowerCase();
}

export function skillService(db: Db) {
  return {
    listCompanySkills: async (companyId: string) => {
      return db
        .select()
        .from(companySkills)
        .where(eq(companySkills.companyId, companyId))
        .orderBy(asc(companySkills.slug));
    },

    createCompanySkill: async (
      companyId: string,
      data: { slug: string; name: string; description?: string | null; sourceType?: string },
    ) => {
      const slug = normalizeSlug(data.slug);
      const [row] = await db
        .insert(companySkills)
        .values({
          companyId,
          slug,
          name: data.name,
          description: data.description ?? null,
          sourceType: data.sourceType ?? "manual",
          updatedAt: new Date(),
        })
        .returning();
      return row;
    },

    updateCompanySkill: async (
      companyId: string,
      skillId: string,
      patch: { name?: string; description?: string | null; sourceType?: string },
    ) => {
      const existing = await db
        .select()
        .from(companySkills)
        .where(and(eq(companySkills.id, skillId), eq(companySkills.companyId, companyId)))
        .then((r) => r[0] ?? null);
      if (!existing) return null;
      const [row] = await db
        .update(companySkills)
        .set({
          ...("name" in patch && patch.name !== undefined ? { name: patch.name } : {}),
          ...("description" in patch ? { description: patch.description ?? null } : {}),
          ...("sourceType" in patch && patch.sourceType !== undefined ? { sourceType: patch.sourceType } : {}),
          updatedAt: new Date(),
        })
        .where(eq(companySkills.id, skillId))
        .returning();
      return row ?? null;
    },

    deleteCompanySkill: async (companyId: string, skillId: string) => {
      const existing = await db
        .select()
        .from(companySkills)
        .where(and(eq(companySkills.id, skillId), eq(companySkills.companyId, companyId)))
        .then((r) => r[0] ?? null);
      if (!existing) return null;
      await db
        .update(agentSkillAttachments)
        .set({ companySkillId: null })
        .where(eq(agentSkillAttachments.companySkillId, skillId));
      await db.delete(companySkills).where(eq(companySkills.id, skillId));
      return existing;
    },

    listAgentAttachments: async (companyId: string, agentId: string) => {
      const agent = await db
        .select()
        .from(agents)
        .where(and(eq(agents.id, agentId), eq(agents.companyId, companyId)))
        .then((r) => r[0] ?? null);
      if (!agent) throw notFound("Agent not found");

      const rows = await db
        .select({
          id: agentSkillAttachments.id,
          skillSlug: agentSkillAttachments.skillSlug,
          companySkillId: agentSkillAttachments.companySkillId,
          createdAt: agentSkillAttachments.createdAt,
          libraryName: companySkills.name,
        })
        .from(agentSkillAttachments)
        .leftJoin(companySkills, eq(agentSkillAttachments.companySkillId, companySkills.id))
        .where(
          and(
            eq(agentSkillAttachments.companyId, companyId),
            eq(agentSkillAttachments.agentId, agentId),
          ),
        )
        .orderBy(asc(agentSkillAttachments.skillSlug));

      return rows.map((r) => ({
        id: r.id,
        skillSlug: r.skillSlug,
        companySkillId: r.companySkillId,
        createdAt: r.createdAt,
        libraryName: r.libraryName,
      }));
    },

    getDesiredSlugs: async (companyId: string, agentId: string): Promise<string[]> => {
      const rows = await db
        .select({ skillSlug: agentSkillAttachments.skillSlug })
        .from(agentSkillAttachments)
        .where(
          and(
            eq(agentSkillAttachments.companyId, companyId),
            eq(agentSkillAttachments.agentId, agentId),
          ),
        );
      return rows.map((r) => r.skillSlug);
    },

    attachAgentSkill: async (companyId: string, agentId: string, skillSlugRaw: string) => {
      const skillSlug = normalizeSlug(skillSlugRaw);
      const agent = await db
        .select()
        .from(agents)
        .where(and(eq(agents.id, agentId), eq(agents.companyId, companyId)))
        .then((r) => r[0] ?? null);
      if (!agent) throw notFound("Agent not found");

      const lib = await db
        .select()
        .from(companySkills)
        .where(and(eq(companySkills.companyId, companyId), eq(companySkills.slug, skillSlug)))
        .then((r) => r[0] ?? null);

      try {
        const [row] = await db
          .insert(agentSkillAttachments)
          .values({
            companyId,
            agentId,
            skillSlug,
            companySkillId: lib?.id ?? null,
          })
          .returning();
        return row;
      } catch {
        throw unprocessable("Skill already attached to this agent");
      }
    },

    detachAgentSkill: async (companyId: string, agentId: string, skillSlugRaw: string) => {
      const skillSlug = normalizeSlug(skillSlugRaw);
      const deleted = await db
        .delete(agentSkillAttachments)
        .where(
          and(
            eq(agentSkillAttachments.companyId, companyId),
            eq(agentSkillAttachments.agentId, agentId),
            eq(agentSkillAttachments.skillSlug, skillSlug),
          ),
        )
        .returning();
      return deleted[0] ?? null;
    },
  };
}
