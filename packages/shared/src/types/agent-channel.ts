import type { AgentChannelPairStatus } from "../constants/agent-channels.js";

export interface AgentChannelDevice {
  id: string;
  deviceId: string;
  deviceName: string | null;
  appVersion: string | null;
  lastSeenAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface AndroidPairStartResult {
  loginId: string;
  /** Numeric ID encoded in QR (Android clients expect integer connection_id). */
  connectionId: number;
  /** Internal UUID for board APIs that need the full record id. */
  connectionRecordId: string;
  expiresAt: string;
  pairingBaseUrl: string;
  qrUrl: string;
  qrBase64?: string | null;
}

export interface AndroidPairPollResult {
  status: AgentChannelPairStatus;
  deviceId?: string;
  deviceName?: string;
  confirmedAt?: string;
}

export interface AndroidPairConfirmResult {
  deviceToken: string;
  /** Alias for legacy Android clients (tangyuan-compatible). */
  deviceSecret?: string;
  deviceRecordId: string;
  deviceId: string;
  connectionId: number;
  connectionRecordId: string;
  agentId: string;
  wsUrl: string;
}

export interface AndroidPairLookupResult {
  valid: boolean;
  status?: "pending" | "connected" | "expired" | "cancelled";
  connectionId?: number;
  agentId?: string;
  expiresAt?: string;
  error?: string;
}
