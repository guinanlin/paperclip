export const AGENT_CHANNEL_TYPES = ["android"] as const;
export type AgentChannelType = (typeof AGENT_CHANNEL_TYPES)[number];

export const AGENT_CHANNEL_CONNECTION_STATUSES = ["active", "paused", "revoked"] as const;
export type AgentChannelConnectionStatus = (typeof AGENT_CHANNEL_CONNECTION_STATUSES)[number];

export const AGENT_CHANNEL_PAIR_STATUSES = ["pending", "connected", "expired", "cancelled"] as const;
export type AgentChannelPairStatus = (typeof AGENT_CHANNEL_PAIR_STATUSES)[number];

export const ANDROID_DEVICE_TOKEN_PREFIX = "pcd_";
