import { api } from "./client";

/** Subset used by Routines / workspace UI when instance experimental API exists. */
export type InstanceExperimentalSettings = {
  enableIsolatedWorkspaces?: boolean;
};

export const instanceSettingsApi = {
  getExperimental: async (): Promise<InstanceExperimentalSettings> => {
    try {
      return await api.get<InstanceExperimentalSettings>("/instance/settings/experimental");
    } catch {
      return { enableIsolatedWorkspaces: false };
    }
  },
};
