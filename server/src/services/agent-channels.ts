import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull, lte, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  agentChannelConnections,
  agentChannelDevices,
  agentChannelPairSessions,
  agentChannelPeers,
  agents,
  projects,
} from "@paperclipai/db";
import { ANDROID_DEVICE_TOKEN_PREFIX, parseAndroidConnectionIdRef } from "@paperclipai/shared";
import type { AndroidConnectionIdRef } from "@paperclipai/shared";
import { badRequest, conflict, notFound } from "../errors.js";
import {
  buildAndroidPairQrUrl,
  buildAndroidWebSocketUrl,
  type PairingUrlResolution,
} from "./android-pairing-url.js";

const PAIR_SESSION_TTL_MS = 10 * 60 * 1000;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function createDeviceToken() {
  return `${ANDROID_DEVICE_TOKEN_PREFIX}${randomBytes(32).toString("hex")}`;
}

async function getAgentOrThrow(db: Db, agentId: string) {
  const agent = await db
    .select()
    .from(agents)
    .where(eq(agents.id, agentId))
    .then((rows) => rows[0] ?? null);
  if (!agent) throw notFound("Agent not found");
  return agent;
}

async function allocateConnectionPublicId(db: Db, companyId: string) {
  const [row] = await db
    .select({
      maxPublicId: sql<number>`coalesce(max(${agentChannelConnections.publicId}), 0)`,
    })
    .from(agentChannelConnections)
    .where(eq(agentChannelConnections.companyId, companyId));

  return Number(row?.maxPublicId ?? 0) + 1;
}

async function resolveConnectionRecord(
  db: Db,
  ref: AndroidConnectionIdRef,
  companyId?: string,
) {
  if (ref.kind === "uuid") {
    const connection = await db
      .select()
      .from(agentChannelConnections)
      .where(eq(agentChannelConnections.id, ref.uuid))
      .then((rows) => rows[0] ?? null);
    if (!connection) return null;
    if (companyId && connection.companyId !== companyId) return null;
    return connection;
  }

  const conditions = [eq(agentChannelConnections.publicId, ref.publicId)];
  if (companyId) {
    conditions.push(eq(agentChannelConnections.companyId, companyId));
  }

  return db
    .select()
    .from(agentChannelConnections)
    .where(and(...conditions))
    .then((rows) => rows[0] ?? null);
}

async function ensureAndroidConnection(
  db: Db,
  input: { companyId: string; agentId: string; displayName?: string | null },
) {
  const existing = await db
    .select()
    .from(agentChannelConnections)
    .where(
      and(
        eq(agentChannelConnections.companyId, input.companyId),
        eq(agentChannelConnections.agentId, input.agentId),
        eq(agentChannelConnections.channel, "android"),
        eq(agentChannelConnections.status, "active"),
      ),
    )
    .orderBy(desc(agentChannelConnections.createdAt))
    .then((rows) => rows[0] ?? null);

  if (existing) return existing;

  const publicId = await allocateConnectionPublicId(db, input.companyId);
  const [created] = await db
    .insert(agentChannelConnections)
    .values({
      companyId: input.companyId,
      agentId: input.agentId,
      channel: "android",
      publicId,
      status: "active",
      displayName: input.displayName?.trim() || "Android Channel",
      metadata: {},
    })
    .returning();

  return created;
}

async function expireStalePairSessions(db: Db, connectionId: string, now = new Date()) {
  await db
    .update(agentChannelPairSessions)
    .set({ status: "expired", updatedAt: now })
    .where(
      and(
        eq(agentChannelPairSessions.connectionId, connectionId),
        eq(agentChannelPairSessions.status, "pending"),
        lte(agentChannelPairSessions.expiresAt, now),
      ),
    );
}

export function agentChannelsService(db: Db) {
  return {
    listAndroidDevices: async (agentId: string, companyId: string) => {
      await getAgentOrThrow(db, agentId);
      const rows = await db
        .select({
          id: agentChannelDevices.id,
          deviceId: agentChannelDevices.deviceId,
          deviceName: agentChannelDevices.deviceName,
          appVersion: agentChannelDevices.appVersion,
          lastSeenAt: agentChannelDevices.lastSeenAt,
          revokedAt: agentChannelDevices.revokedAt,
          createdAt: agentChannelDevices.createdAt,
        })
        .from(agentChannelDevices)
        .where(
          and(
            eq(agentChannelDevices.agentId, agentId),
            eq(agentChannelDevices.companyId, companyId),
            eq(agentChannelDevices.channel, "android"),
          ),
        )
        .orderBy(desc(agentChannelDevices.createdAt));

      return rows.map((row) => ({
        id: row.id,
        deviceId: row.deviceId,
        deviceName: row.deviceName,
        appVersion: row.appVersion,
        lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
        revokedAt: row.revokedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      }));
    },

    startAndroidPair: async (input: {
      agentId: string;
      companyId: string;
      createdByUserId?: string | null;
      connectionName?: string | null;
      pairing: PairingUrlResolution;
    }) => {
      const agent = await getAgentOrThrow(db, input.agentId);
      if (agent.companyId !== input.companyId) throw notFound("Agent not found");

      const connection = await ensureAndroidConnection(db, {
        companyId: input.companyId,
        agentId: input.agentId,
        displayName: input.connectionName,
      });

      const now = new Date();
      await expireStalePairSessions(db, connection.id, now);

      const loginId = crypto.randomUUID();
      const expiresAt = new Date(now.getTime() + PAIR_SESSION_TTL_MS);

      const [inserted] = await db.transaction(async (tx) => {
        await tx
          .update(agentChannelPairSessions)
          .set({ status: "cancelled", updatedAt: now })
          .where(
            and(
              eq(agentChannelPairSessions.connectionId, connection.id),
              eq(agentChannelPairSessions.status, "pending"),
            ),
          );

        return tx.insert(agentChannelPairSessions).values({
          companyId: input.companyId,
          agentId: input.agentId,
          connectionId: connection.id,
          loginId,
          status: "pending",
          expiresAt,
          createdByUserId: input.createdByUserId ?? null,
        }).returning({ id: agentChannelPairSessions.id });
      });

      const qrUrl = buildAndroidPairQrUrl({
        pairingBaseUrl: input.pairing.baseUrl,
        loginId,
        connectionId: connection.publicId,
        agentId: input.agentId,
      });

      return {
        loginId,
        connectionId: connection.publicId,
        connectionRecordId: connection.id,
        expiresAt: expiresAt.toISOString(),
        pairingBaseUrl: input.pairing.baseUrl,
        qrUrl,
      };
    },

    lookupAndroidPair: async (input: {
      loginId: string;
      connectionIdRef: AndroidConnectionIdRef;
    }) => {
      const connection = await resolveConnectionRecord(db, input.connectionIdRef);
      if (!connection) {
        return {
          valid: false,
          error: "connection_id 无效或连接不存在",
        };
      }

      const session = await db
        .select()
        .from(agentChannelPairSessions)
        .where(
          and(
            eq(agentChannelPairSessions.loginId, input.loginId),
            eq(agentChannelPairSessions.connectionId, connection.id),
          ),
        )
        .then((rows) => rows[0] ?? null);

      if (!session) {
        return {
          valid: false,
          error: "配对会话不存在或已过期",
        };
      }

      const now = new Date();
      if (session.status === "pending" && session.expiresAt <= now) {
        await db
          .update(agentChannelPairSessions)
          .set({ status: "expired", updatedAt: now })
          .where(eq(agentChannelPairSessions.id, session.id));
        return {
          valid: false,
          status: "expired" as const,
          connectionId: connection.publicId,
          agentId: session.agentId,
          expiresAt: session.expiresAt.toISOString(),
          error: "配对码已过期，请在 Web 端重新生成",
        };
      }

      return {
        valid: true,
        status: session.status as "pending" | "connected" | "expired" | "cancelled",
        connectionId: connection.publicId,
        agentId: session.agentId,
        expiresAt: session.expiresAt.toISOString(),
      };
    },

    pollAndroidPair: async (input: {
      agentId: string;
      companyId: string;
      loginId: string;
    }) => {
      await getAgentOrThrow(db, input.agentId);

      const session = await db
        .select()
        .from(agentChannelPairSessions)
        .where(
          and(
            eq(agentChannelPairSessions.agentId, input.agentId),
            eq(agentChannelPairSessions.companyId, input.companyId),
            eq(agentChannelPairSessions.loginId, input.loginId),
          ),
        )
        .then((rows) => rows[0] ?? null);

      if (!session) throw notFound("Pair session not found");

      const now = new Date();
      if (session.status === "pending" && session.expiresAt <= now) {
        await db
          .update(agentChannelPairSessions)
          .set({ status: "expired", updatedAt: now })
          .where(eq(agentChannelPairSessions.id, session.id));
        return { status: "expired" as const };
      }

      if (session.status === "connected" && session.confirmedDeviceRecordId) {
        const device = await db
          .select({
            deviceId: agentChannelDevices.deviceId,
            deviceName: agentChannelDevices.deviceName,
          })
          .from(agentChannelDevices)
          .where(eq(agentChannelDevices.id, session.confirmedDeviceRecordId))
          .then((rows) => rows[0] ?? null);

        return {
          status: "connected" as const,
          deviceId: device?.deviceId,
          deviceName: device?.deviceName ?? undefined,
          confirmedAt: session.confirmedAt?.toISOString(),
        };
      }

      return { status: session.status as "pending" | "expired" | "cancelled" };
    },

    confirmAndroidPair: async (input: {
      loginId: string;
      connectionIdRef: AndroidConnectionIdRef;
      deviceId: string;
      deviceName?: string | null;
      appVersion?: string | null;
      pairing: PairingUrlResolution;
    }) => {
      const now = new Date();
      const connection = await resolveConnectionRecord(db, input.connectionIdRef);
      if (!connection || connection.status !== "active") {
        throw notFound("Connection not found");
      }

      const session = await db
        .select()
        .from(agentChannelPairSessions)
        .where(
          and(
            eq(agentChannelPairSessions.loginId, input.loginId),
            eq(agentChannelPairSessions.connectionId, connection.id),
          ),
        )
        .then((rows) => rows[0] ?? null);

      if (!session) {
        throw badRequest("login_id 与 connection_id 不匹配或配对会话不存在");
      }
      if (session.status === "connected") {
        throw conflict("Pair session already consumed");
      }
      if (session.status !== "pending") {
        throw badRequest("Pair session is not pending", { status: session.status });
      }
      if (session.expiresAt <= now) {
        await db
          .update(agentChannelPairSessions)
          .set({ status: "expired", updatedAt: now })
          .where(eq(agentChannelPairSessions.id, session.id));
        throw badRequest("Pair session expired");
      }

      const connectionRecordId = connection.id;

      const existingDevice = await db
        .select()
        .from(agentChannelDevices)
        .where(
          and(
            eq(agentChannelDevices.connectionId, connectionRecordId),
            eq(agentChannelDevices.deviceId, input.deviceId),
          ),
        )
        .then((rows) => rows[0] ?? null);

      const deviceToken = createDeviceToken();
      const tokenHash = hashToken(deviceToken);

      let deviceRecordId: string;
      if (existingDevice) {
        if (existingDevice.revokedAt) {
          const [updated] = await db
            .update(agentChannelDevices)
            .set({
              deviceTokenHash: tokenHash,
              deviceName: input.deviceName?.trim() || existingDevice.deviceName,
              appVersion: input.appVersion?.trim() || existingDevice.appVersion,
              revokedAt: null,
              lastSeenAt: now,
              updatedAt: now,
            })
            .where(eq(agentChannelDevices.id, existingDevice.id))
            .returning({ id: agentChannelDevices.id });
          deviceRecordId = updated.id;
        } else {
          throw conflict("Device already bound to this connection");
        }
      } else {
        const [created] = await db
          .insert(agentChannelDevices)
          .values({
            companyId: session.companyId,
            agentId: session.agentId,
            connectionId: connectionRecordId,
            channel: "android",
            deviceId: input.deviceId,
            deviceName: input.deviceName?.trim() || null,
            deviceTokenHash: tokenHash,
            appVersion: input.appVersion?.trim() || null,
            lastSeenAt: now,
          })
          .returning({ id: agentChannelDevices.id });
        deviceRecordId = created.id;
      }

      await db
        .update(agentChannelPairSessions)
        .set({
          status: "connected",
          confirmedAt: now,
          confirmedDeviceRecordId: deviceRecordId,
          updatedAt: now,
        })
        .where(eq(agentChannelPairSessions.id, session.id));

      return {
        companyId: session.companyId,
        deviceToken,
        deviceSecret: deviceToken,
        deviceId: input.deviceId,
        connectionId: connection.publicId,
        connectionRecordId,
        agentId: session.agentId,
        wsUrl: buildAndroidWebSocketUrl(input.pairing.baseUrl),
        deviceRecordId,
      };
    },

    revokeAndroidDevice: async (input: {
      agentId: string;
      companyId: string;
      deviceRecordId: string;
    }) => {
      await getAgentOrThrow(db, input.agentId);
      const device = await db
        .select()
        .from(agentChannelDevices)
        .where(
          and(
            eq(agentChannelDevices.id, input.deviceRecordId),
            eq(agentChannelDevices.agentId, input.agentId),
            eq(agentChannelDevices.companyId, input.companyId),
          ),
        )
        .then((rows) => rows[0] ?? null);

      if (!device) throw notFound("Device not found");
      if (device.revokedAt) return device;

      const now = new Date();
      const [updated] = await db
        .update(agentChannelDevices)
        .set({ revokedAt: now, updatedAt: now })
        .where(eq(agentChannelDevices.id, device.id))
        .returning();

      return updated;
    },

    authenticateDeviceToken: async (token: string) => {
      const tokenHash = hashToken(token);
      const device = await db
        .select()
        .from(agentChannelDevices)
        .where(
          and(
            eq(agentChannelDevices.deviceTokenHash, tokenHash),
            isNull(agentChannelDevices.revokedAt),
          ),
        )
        .then((rows) => rows[0] ?? null);

      if (!device) return null;

      const connection = await db
        .select()
        .from(agentChannelConnections)
        .where(eq(agentChannelConnections.id, device.connectionId))
        .then((rows) => rows[0] ?? null);

      if (!connection || connection.status !== "active") return null;

      return { device, connection };
    },

    touchDeviceLastSeen: async (deviceRecordId: string) => {
      const now = new Date();
      await db
        .update(agentChannelDevices)
        .set({ lastSeenAt: now, updatedAt: now })
        .where(eq(agentChannelDevices.id, deviceRecordId));
    },

    getPeerIssueId: async (deviceRecordId: string, peerId: string) => {
      const peer = await db
        .select({ issueId: agentChannelPeers.issueId })
        .from(agentChannelPeers)
        .where(
          and(
            eq(agentChannelPeers.deviceRecordId, deviceRecordId),
            eq(agentChannelPeers.peerId, peerId),
          ),
        )
        .then((rows) => rows[0] ?? null);
      return peer?.issueId ?? null;
    },

    upsertPeer: async (input: {
      companyId: string;
      deviceRecordId: string;
      peerId: string;
      peerLabel?: string | null;
      issueId?: string | null;
    }) => {
      const now = new Date();
      const existing = await db
        .select()
        .from(agentChannelPeers)
        .where(
          and(
            eq(agentChannelPeers.deviceRecordId, input.deviceRecordId),
            eq(agentChannelPeers.peerId, input.peerId),
          ),
        )
        .then((rows) => rows[0] ?? null);

      if (existing) {
        await db
          .update(agentChannelPeers)
          .set({
            peerLabel: input.peerLabel?.trim() || existing.peerLabel,
            issueId: input.issueId ?? existing.issueId,
            lastMessageAt: now,
            updatedAt: now,
          })
          .where(eq(agentChannelPeers.id, existing.id));
        return existing.id;
      }

      const [created] = await db
        .insert(agentChannelPeers)
        .values({
          companyId: input.companyId,
          deviceRecordId: input.deviceRecordId,
          peerId: input.peerId,
          peerLabel: input.peerLabel?.trim() || null,
          issueId: input.issueId ?? null,
          lastMessageAt: now,
        })
        .returning({ id: agentChannelPeers.id });

      return created.id;
    },

    getDefaultProjectId: async (companyId: string) => {
      const project = await db
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.companyId, companyId))
        .orderBy(desc(projects.createdAt))
        .then((rows) => rows[0] ?? null);
      return project?.id ?? null;
    },
  };
}

export type AgentChannelsService = ReturnType<typeof agentChannelsService>;
