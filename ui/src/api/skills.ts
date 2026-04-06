import { api } from "./client";

export interface CompanySkillRow {
  id: string;
  companyId: string;
  slug: string;
  name: string;
  description: string | null;
  sourceType: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentSkillAttachmentRow {
  id: string;
  skillSlug: string;
  companySkillId: string | null;
  createdAt: string;
  libraryName: string | null;
}

export interface AdapterSkillListEntry {
  slug: string;
  present: boolean;
  desired: boolean;
  source?: "paperclip_bundled" | "local_disk" | "missing";
}

export interface AgentSkillSyncState {
  mode: "persistent" | "ephemeral" | "unsupported";
  adapterType: string | null;
  desiredSlugs: string[];
  entries: AdapterSkillListEntry[];
  skillsHome?: string;
  message?: string;
  sharedHomeNote?: string;
}

export const skillsApi = {
  listCompanySkills: (companyId: string) =>
    api.get<CompanySkillRow[]>(`/companies/${encodeURIComponent(companyId)}/skills`),

  createCompanySkill: (
    companyId: string,
    body: { slug: string; name: string; description?: string | null; sourceType?: string },
  ) => api.post<CompanySkillRow>(`/companies/${encodeURIComponent(companyId)}/skills`, body),

  updateCompanySkill: (
    companyId: string,
    skillId: string,
    body: { name?: string; description?: string | null; sourceType?: string },
  ) =>
    api.patch<CompanySkillRow>(
      `/companies/${encodeURIComponent(companyId)}/skills/${encodeURIComponent(skillId)}`,
      body,
    ),

  deleteCompanySkill: (companyId: string, skillId: string) =>
    api.delete<{ ok: true }>(
      `/companies/${encodeURIComponent(companyId)}/skills/${encodeURIComponent(skillId)}`,
    ),

  listAgentAttachments: (companyId: string, agentId: string) =>
    api.get<AgentSkillAttachmentRow[]>(
      `/companies/${encodeURIComponent(companyId)}/agents/${encodeURIComponent(agentId)}/skill-attachments`,
    ),

  attachAgentSkill: (companyId: string, agentId: string, skillSlug: string) =>
    api.post<AgentSkillAttachmentRow>(
      `/companies/${encodeURIComponent(companyId)}/agents/${encodeURIComponent(agentId)}/skill-attachments`,
      { skillSlug },
    ),

  detachAgentSkill: (companyId: string, agentId: string, skillSlug: string) =>
    api.delete<{ ok: true }>(
      `/companies/${encodeURIComponent(companyId)}/agents/${encodeURIComponent(agentId)}/skill-attachments/${encodeURIComponent(skillSlug)}`,
    ),

  getAgentSkillSyncState: (companyId: string, agentId: string) =>
    api.get<AgentSkillSyncState>(
      `/companies/${encodeURIComponent(companyId)}/agents/${encodeURIComponent(agentId)}/skills/sync-state`,
    ),

  syncAgentSkills: (companyId: string, agentId: string) =>
    api.post<AgentSkillSyncState>(
      `/companies/${encodeURIComponent(companyId)}/agents/${encodeURIComponent(agentId)}/skills/sync`,
      {},
    ),
};
