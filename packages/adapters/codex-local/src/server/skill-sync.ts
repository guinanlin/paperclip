import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AdapterSkillListResult,
  AdapterSkillSyncContext,
} from "@paperclipai/adapter-utils";
import {
  listSkillSlugsInHome,
  mergeAdapterSkillEntries,
  parseObject,
  ensureDesiredSkillsSymlinkedFromPaperclip,
} from "@paperclipai/adapter-utils/server-utils";
import { prepareWorktreeCodexHome, resolveCodexHomeDir } from "./codex-home.js";

const __moduleDir = path.dirname(fileURLToPath(import.meta.url));

async function resolveCodexSkillsHome(
  config: Record<string, unknown>,
  onLog: AdapterSkillSyncContext["onLog"],
): Promise<string> {
  const envConfig = parseObject(config.env);
  const configuredCodexHome =
    typeof envConfig.CODEX_HOME === "string" && envConfig.CODEX_HOME.trim().length > 0
      ? path.resolve(envConfig.CODEX_HOME.trim())
      : null;
  const preparedWorktreeCodexHome =
    configuredCodexHome ? null : await prepareWorktreeCodexHome(process.env, onLog);
  const effectiveCodexHome = configuredCodexHome ?? preparedWorktreeCodexHome ?? resolveCodexHomeDir(process.env);
  return path.join(effectiveCodexHome, "skills");
}

export async function listCodexSkills(ctx: AdapterSkillSyncContext): Promise<AdapterSkillListResult> {
  const skillsHome = await resolveCodexSkillsHome(ctx.config, ctx.onLog);
  const disk = await listSkillSlugsInHome(skillsHome);
  return {
    mode: "persistent",
    skillsHome,
    entries: mergeAdapterSkillEntries(disk, ctx.desiredSlugs),
  };
}

export async function syncCodexSkills(ctx: AdapterSkillSyncContext): Promise<AdapterSkillListResult> {
  const skillsHome = await resolveCodexSkillsHome(ctx.config, ctx.onLog);
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
