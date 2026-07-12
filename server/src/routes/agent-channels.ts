import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { androidPairConfirmSchema, androidPairPollSchema, androidPairStartSchema, parseAndroidConnectionIdRef } from "@paperclipai/shared";
import { badRequest } from "../errors.js";
import { validate } from "../middleware/validate.js";
import { agentChannelsService } from "../services/agent-channels.js";
import { resolveAndroidPairingBaseUrl, resolveAndroidPairingBaseUrlForMobile } from "../services/android-pairing-url.js";
import { disconnectAndroidDeviceSockets } from "../realtime/android-channel-registry.js";
import { agentService, logActivity } from "../services/index.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";

function routeParam(value: string | string[]): string {
  return Array.isArray(value) ? (value[0] ?? "") : value;
}

async function generateQrBase64(qrUrl: string): Promise<string | null> {
  try {
    const qrcode = await import("qrcode");
    return await qrcode.default.toDataURL(qrUrl, {
      margin: 1,
      width: 240,
      errorCorrectionLevel: "M",
    });
  } catch {
    return null;
  }
}

export function agentChannelRoutes(db: Db) {
  const router = Router();
  const channels = agentChannelsService(db);

  router.post(
    "/agents/:agentId/channels/android/pair/start",
    validate(androidPairStartSchema),
    async (req, res, next) => {
      try {
        assertBoard(req);
        const agentId = routeParam(req.params.agentId);
        const agent = await agentService(db).getById(agentId);
        if (!agent) {
          res.status(404).json({ error: "Agent not found" });
          return;
        }
        assertCompanyAccess(req, agent.companyId);

        const pairing = resolveAndroidPairingBaseUrlForMobile(req);
        const actor = getActorInfo(req);
        const result = await channels.startAndroidPair({
          agentId,
          companyId: agent.companyId,
          createdByUserId: actor.actorId,
          connectionName: req.body.connectionName,
          pairing,
        });

        const qrBase64 = await generateQrBase64(result.qrUrl);

        await logActivity(db, {
          companyId: agent.companyId,
          actorType: actor.actorType,
          actorId: actor.actorId,
          action: "agent_channel.android.pair_started",
          entityType: "agent_channel_connection",
          entityId: result.connectionRecordId,
          agentId,
          details: {
            loginId: result.loginId,
            publicConnectionId: result.connectionId,
            pairingBaseUrl: result.pairingBaseUrl,
            pairingSource: pairing.source,
          },
        });

        res.status(201).json({ ...result, qrBase64 });
      } catch (err) {
        next(err);
      }
    },
  );

  router.get("/agents/:agentId/channels/android/pair/poll", async (req, res, next) => {
    try {
      assertBoard(req);
      const agentId = routeParam(req.params.agentId);
      const { login_id: loginId } = androidPairPollSchema.parse(req.query);

      const agent = await agentService(db).getById(agentId);
      if (!agent) {
        res.status(404).json({ error: "Agent not found" });
        return;
      }
      assertCompanyAccess(req, agent.companyId);

      const result = await channels.pollAndroidPair({
        agentId,
        companyId: agent.companyId,
        loginId,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.get("/channel/android/pair/lookup", async (req, res, next) => {
    try {
      const loginId = String(req.query.login_id ?? "").trim();
      const connectionIdRaw = req.query.connection_id;
      if (!loginId) {
        res.status(400).json({ valid: false, error: "login_id is required" });
        return;
      }

      const connectionIdRef = parseAndroidConnectionIdRef(connectionIdRaw);
      if (!connectionIdRef) {
        res.status(400).json({ valid: false, error: "connection_id 无效" });
        return;
      }

      const result = await channels.lookupAndroidPair({ loginId, connectionIdRef });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post("/channel/android/pair/confirm", validate(androidPairConfirmSchema), async (req, res, next) => {
    try {
      const connectionIdRef = parseAndroidConnectionIdRef(req.body.connection_id);
      if (!connectionIdRef) {
        throw badRequest("connection_id 无效");
      }

      const pairing = resolveAndroidPairingBaseUrl(req);
      const result = await channels.confirmAndroidPair({
        loginId: req.body.login_id,
        connectionIdRef,
        deviceId: req.body.device_id,
        deviceName: req.body.device_name,
        appVersion: req.body.app_version,
        pairing,
      });

      await logActivity(db, {
        companyId: result.companyId,
        actorType: "system",
        actorId: "android-pair-confirm",
        action: "agent_channel.android.device_bound",
        entityType: "agent_channel_device",
        entityId: result.deviceRecordId,
        agentId: result.agentId,
        details: {
          deviceId: result.deviceId,
          connectionId: result.connectionId,
        },
      });

      res.json({
        deviceToken: result.deviceToken,
        deviceSecret: result.deviceSecret,
        deviceId: result.deviceId,
        connectionId: result.connectionId,
        connectionRecordId: result.connectionRecordId,
        agentId: result.agentId,
        wsUrl: result.wsUrl,
      });
    } catch (err) {
      next(err);
    }
  });

  router.get("/agents/:agentId/channels/android/devices", async (req, res, next) => {
    try {
      assertBoard(req);
      const agentId = routeParam(req.params.agentId);
      const agent = await agentService(db).getById(agentId);
      if (!agent) {
        res.status(404).json({ error: "Agent not found" });
        return;
      }
      assertCompanyAccess(req, agent.companyId);

      const devices = await channels.listAndroidDevices(agentId, agent.companyId);
      res.json({ devices });
    } catch (err) {
      next(err);
    }
  });

  router.post("/agents/:agentId/channels/android/devices/:deviceRecordId/revoke", async (req, res, next) => {
    try {
      assertBoard(req);
      const agentId = routeParam(req.params.agentId);
      const deviceRecordId = routeParam(req.params.deviceRecordId);
      const agent = await agentService(db).getById(agentId);
      if (!agent) {
        res.status(404).json({ error: "Agent not found" });
        return;
      }
      assertCompanyAccess(req, agent.companyId);

      const revoked = await channels.revokeAndroidDevice({
        agentId,
        companyId: agent.companyId,
        deviceRecordId,
      });

      disconnectAndroidDeviceSockets(revoked.id);

      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId: agent.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        action: "agent_channel.android.device_revoked",
        entityType: "agent_channel_device",
        entityId: revoked.id,
        agentId,
        details: { deviceId: revoked.deviceId },
      });

      res.json({
        id: revoked.id,
        deviceId: revoked.deviceId,
        revokedAt: revoked.revokedAt?.toISOString() ?? null,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
