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

function piSkillsHome(): string {
  return path.join(os.homedir(), ".pi", "agent", "skills");
}

export async function listPiSkills(ctx: AdapterSkillSyncContext): Promise<AdapterSkillListResult> {
  const skillsHome = piSkillsHome();
  const disk = await listSkillSlugsInHome(skillsHome);
  return {
    mode: "persistent",
    skillsHome,
    entries: mergeAdapterSkillEntries(disk, ctx.desiredSlugs),
  };
}

export async function syncPiSkills(ctx: AdapterSkillSyncContext): Promise<AdapterSkillListResult> {
  const skillsHome = piSkillsHome();
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
