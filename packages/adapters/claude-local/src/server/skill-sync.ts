import os from "node:os";
import path from "node:path";
import type {
  AdapterSkillListResult,
  AdapterSkillSyncContext,
} from "@paperclipai/adapter-utils";
import { listSkillSlugsInHome, mergeAdapterSkillEntries } from "@paperclipai/adapter-utils/server-utils";

const EPHEMERAL_MSG =
  "Claude Code runs use a temporary `.claude/skills` directory for Paperclip-injected skills. " +
  "The path below is your global `~/.claude/skills` (if any); Paperclip sync does not modify it.";

function claudeGlobalSkillsHome(): string {
  return path.join(os.homedir(), ".claude", "skills");
}

export async function listClaudeSkills(ctx: AdapterSkillSyncContext): Promise<AdapterSkillListResult> {
  const skillsHome = claudeGlobalSkillsHome();
  const disk = await listSkillSlugsInHome(skillsHome);
  return {
    mode: "ephemeral",
    skillsHome,
    message: EPHEMERAL_MSG,
    entries: mergeAdapterSkillEntries(disk, ctx.desiredSlugs),
  };
}

export async function syncClaudeSkills(ctx: AdapterSkillSyncContext): Promise<AdapterSkillListResult> {
  return {
    ...(await listClaudeSkills(ctx)),
    message:
      `${EPHEMERAL_MSG} Sync is a no-op for this adapter; injected skills are applied when the agent runs.`,
  };
}
