import type {
  AgentChannelDevice,
  AndroidPairPollResult,
  AndroidPairStartResult,
} from "@paperclipai/shared";
import { api } from "./client";

function agentChannelPath(agentId: string, suffix: string) {
  return `/agents/${encodeURIComponent(agentId)}/channels/android${suffix}`;
}

export const agentChannelsApi = {
  startAndroidPair: (agentId: string, body?: { connectionName?: string }) =>
    api.post<AndroidPairStartResult>(
      agentChannelPath(agentId, "/pair/start"),
      body ?? {},
    ),

  pollAndroidPair: (agentId: string, loginId: string) =>
    api.get<AndroidPairPollResult>(
      `${agentChannelPath(agentId, "/pair/poll")}?login_id=${encodeURIComponent(loginId)}`,
    ),

  listAndroidDevices: (agentId: string) =>
    api.get<{ devices: AgentChannelDevice[] }>(
      agentChannelPath(agentId, "/devices"),
    ),

  revokeAndroidDevice: (agentId: string, deviceRecordId: string) =>
    api.post<{ id: string; deviceId: string; revokedAt: string | null }>(
      agentChannelPath(agentId, `/devices/${encodeURIComponent(deviceRecordId)}/revoke`),
      {},
    ),
};
