import type {
  IssueCreationShortcut,
  CreateIssueCreationShortcut,
  UpdateIssueCreationShortcut,
} from "@paperclipai/shared";
import { api } from "./client";

export const issueCreationShortcutsApi = {
  list: (companyId: string) =>
    api.get<IssueCreationShortcut[]>(`/companies/${companyId}/issue-creation-shortcuts`),

  create: (companyId: string, data: CreateIssueCreationShortcut) =>
    api.post<IssueCreationShortcut>(`/companies/${companyId}/issue-creation-shortcuts`, data),

  update: (id: string, data: UpdateIssueCreationShortcut) =>
    api.patch<IssueCreationShortcut>(`/issue-creation-shortcuts/${id}`, data),

  remove: (id: string) => api.delete<IssueCreationShortcut>(`/issue-creation-shortcuts/${id}`),
};
