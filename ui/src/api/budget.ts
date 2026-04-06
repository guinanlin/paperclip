import { api } from "./client";

export interface BudgetPolicyRow {
  id: string;
  companyId: string;
  scopeType: string;
  scopeId: string | null;
  metric: string;
  windowKind: string;
  amount: number;
  warnPercent: number;
  hardStopEnabled: boolean;
  notifyEnabled: boolean;
  isActive: boolean;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetIncidentRow {
  id: string;
  companyId: string;
  policyId: string;
  scopeType: string;
  scopeId: string | null;
  metric: string;
  windowKind: string;
  windowStart: string;
  windowEnd: string | null;
  thresholdType: string;
  amountLimit: number;
  amountObserved: number;
  status: string;
  approvalId: string | null;
  activityId: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const budgetApi = {
  listPolicies: (companyId: string) =>
    api.get<BudgetPolicyRow[]>(`/companies/${encodeURIComponent(companyId)}/budget-policies`),

  createPolicy: (
    companyId: string,
    body: {
      scopeType: string;
      scopeId?: string | null;
      metric?: string;
      windowKind: string;
      amount: number;
      warnPercent?: number;
      hardStopEnabled?: boolean;
      notifyEnabled?: boolean;
      isActive?: boolean;
    },
  ) => api.post<BudgetPolicyRow>(`/companies/${encodeURIComponent(companyId)}/budget-policies`, body),

  updatePolicy: (
    companyId: string,
    policyId: string,
    body: Partial<{
      scopeType: string;
      scopeId: string | null;
      metric: string;
      windowKind: string;
      amount: number;
      warnPercent: number;
      hardStopEnabled: boolean;
      notifyEnabled: boolean;
      isActive: boolean;
    }>,
  ) =>
    api.patch<BudgetPolicyRow>(
      `/companies/${encodeURIComponent(companyId)}/budget-policies/${encodeURIComponent(policyId)}`,
      body,
    ),

  deletePolicy: (companyId: string, policyId: string) =>
    api.delete<{ ok: true }>(
      `/companies/${encodeURIComponent(companyId)}/budget-policies/${encodeURIComponent(policyId)}`,
    ),

  listIncidents: (companyId: string, status?: string) => {
    const q = status ? `?status=${encodeURIComponent(status)}` : "";
    return api.get<BudgetIncidentRow[]>(
      `/companies/${encodeURIComponent(companyId)}/budget-incidents${q}`,
    );
  },
};
