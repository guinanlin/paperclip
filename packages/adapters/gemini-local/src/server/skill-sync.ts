import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AdapterSkillListResult,
  AdapterSkillSyncContext,
} from "@paperclipai/adapter-utils";
import {
  listSkillSlugsInHome,
  mergeAdapterSkillEntries,
  ensureDesiredSkillsSymlinkedFromPaperclip,
} from "@paperclipai/adapter-utils/server-utils";

const __moduleDir = path.dirname(fileURLToPath(import.meta.url));

function geminiSkillsHome(): string {
  return path.join(os.homedir(), ".gemini", "skills");
}

export async function listGeminiSkills(ctx: AdapterSkillSyncContext): Promise<AdapterSkillListResult> {
  const skillsHome = geminiSkillsHome();
  const disk = await listSkillSlugsInHome(skillsHome);
  return {
    mode: "persistent",
    skillsHome,
    entries: mergeAdapterSkillEntries(disk, ctx.desiredSlugs),
  };
}

export async function syncGeminiSkills(ctx: AdapterSkillSyncContext): Promise<AdapterSkillListResult> {
  const skillsHome = geminiSkillsHome();
  const { linkedLower, missingLower } = await ensureDesiredSkillsSymlinkedFromPaperclip({
    moduleDir: __moduleDir,
    skillsHome,
    desiredSlugs: ctx.desiredSlugs,
  });
  const disk = await listSkillSlugsInHome(skillsHome);
  return {
    mode: "persistent",
    skillsHome,
    entries: mergeAdapterSkillEntries(disk, ctx.desiredSlugs, {
      bundleMissingLower: missingLower,
      linkedFromBundleLower: linkedLower,
    }),
  };
}
