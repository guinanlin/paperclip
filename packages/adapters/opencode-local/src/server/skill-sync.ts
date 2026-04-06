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

const SHARED_HOME_NOTE =
  "OpenCode uses `~/.claude/skills`, which may be shared with Claude Code and other tools on this machine.";

function openCodeSkillsHome(): string {
  return path.join(os.homedir(), ".claude", "skills");
}

export async function listOpenCodeSkills(ctx: AdapterSkillSyncContext): Promise<AdapterSkillListResult> {
  const skillsHome = openCodeSkillsHome();
  const disk = await listSkillSlugsInHome(skillsHome);
  return {
    mode: "persistent",
    skillsHome,
    sharedHomeNote: SHARED_HOME_NOTE,
    entries: mergeAdapterSkillEntries(disk, ctx.desiredSlugs),
  };
}

export async function syncOpenCodeSkills(ctx: AdapterSkillSyncContext): Promise<AdapterSkillListResult> {
  const skillsHome = openCodeSkillsHome();
  const { linkedLower, missingLower } = await ensureDesiredSkillsSymlinkedFromPaperclip({
    moduleDir: __moduleDir,
    skillsHome,
    desiredSlugs: ctx.desiredSlugs,
  });
  const disk = await listSkillSlugsInHome(skillsHome);
  return {
    mode: "persistent",
    skillsHome,
    sharedHomeNote: SHARED_HOME_NOTE,
    entries: mergeAdapterSkillEntries(disk, ctx.desiredSlugs, {
      bundleMissingLower: missingLower,
      linkedFromBundleLower: linkedLower,
    }),
  };
}
