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

function cursorSkillsHome(): string {
  return path.join(os.homedir(), ".cursor", "skills");
}

export async function listCursorSkills(ctx: AdapterSkillSyncContext): Promise<AdapterSkillListResult> {
  const skillsHome = cursorSkillsHome();
  const disk = await listSkillSlugsInHome(skillsHome);
  return {
    mode: "persistent",
    skillsHome,
    entries: mergeAdapterSkillEntries(disk, ctx.desiredSlugs),
  };
}

export async function syncCursorSkills(ctx: AdapterSkillSyncContext): Promise<AdapterSkillListResult> {
  const skillsHome = cursorSkillsHome();
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
