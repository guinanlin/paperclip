import { pgTable, uuid, text, timestamp, jsonb, index, uniqueIndex, integer } from "drizzle-orm/pg-core";
import { agents } from "./agents.js";
import { companies } from "./companies.js";

export const agentChannelConnections = pgTable(
  "agent_channel_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    channel: text("channel").notNull().default("android"),
    publicId: integer("public_id").notNull(),
    status: text("status").notNull().default("active"),
    displayName: text("display_name"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyAgentChannelIdx: index("agent_channel_connections_company_agent_idx").on(
      table.companyId,
      table.agentId,
      table.channel,
    ),
    companyPublicIdUq: uniqueIndex("agent_channel_connections_company_public_id_uq").on(
      table.companyId,
      table.publicId,
    ),
  }),
);

export const agentChannelPairSessions = pgTable(
  "agent_channel_pair_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => agentChannelConnections.id, { onDelete: "cascade" }),
    loginId: uuid("login_id").notNull(),
    status: text("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    confirmedDeviceRecordId: uuid("confirmed_device_record_id"),
    createdByUserId: text("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    loginIdUq: uniqueIndex("agent_channel_pair_sessions_login_id_uq").on(table.loginId),
    companyAgentIdx: index("agent_channel_pair_sessions_company_agent_idx").on(
      table.companyId,
      table.agentId,
    ),
    connectionIdx: index("agent_channel_pair_sessions_connection_idx").on(table.connectionId),
  }),
);

export const agentChannelDevices = pgTable(
  "agent_channel_devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => agentChannelConnections.id, { onDelete: "cascade" }),
    channel: text("channel").notNull().default("android"),
    deviceId: text("device_id").notNull(),
    deviceName: text("device_name"),
    deviceTokenHash: text("device_token_hash").notNull(),
    appVersion: text("app_version"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyAgentIdx: index("agent_channel_devices_company_agent_idx").on(table.companyId, table.agentId),
    connectionDeviceUq: uniqueIndex("agent_channel_devices_connection_device_uq").on(
      table.connectionId,
      table.deviceId,
    ),
    tokenHashIdx: index("agent_channel_devices_token_hash_idx").on(table.deviceTokenHash),
  }),
);

export const agentChannelPeers = pgTable(
  "agent_channel_peers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    deviceRecordId: uuid("device_record_id")
      .notNull()
      .references(() => agentChannelDevices.id, { onDelete: "cascade" }),
    peerId: text("peer_id").notNull(),
    peerLabel: text("peer_label"),
    issueId: uuid("issue_id"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    devicePeerUq: uniqueIndex("agent_channel_peers_device_peer_uq").on(table.deviceRecordId, table.peerId),
    companyIdx: index("agent_channel_peers_company_idx").on(table.companyId),
  }),
);
