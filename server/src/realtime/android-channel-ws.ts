import type { IncomingMessage, Server as HttpServer } from "node:http";
import { createRequire } from "node:module";
import type { Duplex } from "node:stream";
import type { Db } from "@paperclipai/db";
import { logger } from "../middleware/logger.js";
import { agentChannelsService } from "../services/agent-channels.js";
import { heartbeatService, issueService, logActivity } from "../services/index.js";
import { disconnectAndroidDeviceSockets, registerAndroidDeviceSocket, unregisterAndroidDeviceSocket } from "./android-channel-registry.js";

interface WsSocket {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  terminate(): void;
  on(event: "message", listener: (data: Buffer, isBinary: boolean) => void): void;
  on(event: "close", listener: () => void): void;
  on(event: "error", listener: (err: Error) => void): void;
}

interface WsServer {
  clients: Set<WsSocket>;
  on(event: "connection", listener: (socket: WsSocket, req: IncomingMessage) => void): void;
  on(event: "close", listener: () => void): void;
  handleUpgrade(
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    callback: (ws: WsSocket) => void,
  ): void;
  emit(event: "connection", ws: WsSocket, req: IncomingMessage): boolean;
}

const require = createRequire(import.meta.url);
const { WebSocket, WebSocketServer } = require("ws") as {
  WebSocket: { OPEN: number };
  WebSocketServer: new (opts: { noServer: boolean }) => WsServer;
};

const ANDROID_WS_PATH = "/api/channel/android/ws";
const PING_INTERVAL_MS = 30_000;
const PONG_TIMEOUT_MS = 90_000;

interface AndroidWsContext {
  deviceRecordId: string;
  deviceId: string;
  agentId: string;
  companyId: string;
  connectionId: number;
  connectionRecordId: string;
}

interface IncomingMessageWithContext extends IncomingMessage {
  androidChannelContext?: AndroidWsContext;
}

function rejectUpgrade(socket: Duplex, statusLine: string, message: string) {
  const safe = message.replace(/[\r\n]+/g, " ").trim();
  socket.write(`HTTP/1.1 ${statusLine}\r\nConnection: close\r\nContent-Type: text/plain\r\n\r\n${safe}`);
  socket.destroy();
}

function parseBearerToken(rawAuth: string | string[] | undefined) {
  const auth = Array.isArray(rawAuth) ? rawAuth[0] : rawAuth;
  if (!auth) return null;
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  const token = auth.slice("bearer ".length).trim();
  return token.length > 0 ? token : null;
}

function sendJson(socket: WsSocket, payload: Record<string, unknown>) {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(payload));
}

function sendError(socket: WsSocket, code: string, message: string) {
  sendJson(socket, { type: "error", code, message });
}

export function setupAndroidChannelWebSocketServer(server: HttpServer, db: Db) {
  const channels = agentChannelsService(db);
  const issues = issueService(db);
  const heartbeat = heartbeatService(db);
  const wss = new WebSocketServer({ noServer: true });
  const lastPongAtByClient = new Map<WsSocket, number>();

  const pingInterval = setInterval(() => {
    const now = Date.now();
    for (const socket of wss.clients) {
      const lastPongAt = lastPongAtByClient.get(socket) ?? now;
      if (now - lastPongAt > PONG_TIMEOUT_MS) {
        socket.terminate();
        continue;
      }
      sendJson(socket, { type: "ping" });
    }
  }, PING_INTERVAL_MS);

  wss.on("connection", (socket: WsSocket, req: IncomingMessage) => {
    const context = (req as IncomingMessageWithContext).androidChannelContext;
    if (!context) {
      socket.close(1008, "missing context");
      return;
    }

    lastPongAtByClient.set(socket, Date.now());
    registerAndroidDeviceSocket(context.deviceRecordId, socket);

    sendJson(socket, {
      type: "connected",
      connection_id: context.connectionId,
      device_id: context.deviceId,
      agent_id: context.agentId,
    });

    void channels.touchDeviceLastSeen(context.deviceRecordId);

    socket.on("message", (raw) => {
      void (async () => {
        try {
          const text = raw.toString("utf8");
          let payload: Record<string, unknown>;
          try {
            payload = JSON.parse(text) as Record<string, unknown>;
          } catch {
            sendError(socket, "invalid_json", "Message must be valid JSON");
            return;
          }

          const type = typeof payload.type === "string" ? payload.type : "";
          if (type === "pong") {
            lastPongAtByClient.set(socket, Date.now());
            return;
          }

          if (type !== "message") {
            sendError(socket, "unsupported_type", `Unsupported frame type: ${type || "missing"}`);
            return;
          }

          const peerId = typeof payload.peer_id === "string" ? payload.peer_id.trim() : "";
          const peerLabel = typeof payload.peer_label === "string" ? payload.peer_label.trim() : "";
          const messageText = typeof payload.text === "string" ? payload.text.trim() : "";

          if (!peerId || !messageText) {
            sendError(socket, "invalid_payload", "peer_id and text are required");
            return;
          }

          let issueId = await channels.getPeerIssueId(context.deviceRecordId, peerId);
          if (!issueId) {
            const projectId = await channels.getDefaultProjectId(context.companyId);
            if (!projectId) {
              sendError(socket, "no_project", "Company has no project for Android messages");
              return;
            }

            const title = peerLabel
              ? `[Android] ${peerLabel}`
              : `[Android] ${peerId}`;
            const issue = await issues.create(context.companyId, {
              projectId,
              title,
              description: "Inbound message channel from Android bind.",
              status: "todo",
              assigneeAgentId: context.agentId,
              priority: "medium",
            });
            issueId = issue.id;

            await logActivity(db, {
              companyId: context.companyId,
              actorType: "system",
              actorId: `android-device:${context.deviceId}`,
              action: "issue.created",
              entityType: "issue",
              entityId: issueId,
              agentId: context.agentId,
              details: { channel: "android", peerId },
            });
          }

          await logActivity(db, {
            companyId: context.companyId,
            actorType: "system",
            actorId: `android-device:${context.deviceId}`,
            action: "issue.comment_added",
            entityType: "issue_comment",
            entityId: issueId,
            agentId: context.agentId,
            details: { channel: "android", peerId },
          });

          const commentBody = peerLabel
            ? `**${peerLabel}** (${peerId}):\n\n${messageText}`
            : `**${peerId}**:\n\n${messageText}`;

          await issues.addComment(issueId, commentBody, { agentId: context.agentId });
          await channels.upsertPeer({
            companyId: context.companyId,
            deviceRecordId: context.deviceRecordId,
            peerId,
            peerLabel,
            issueId,
          });

          try {
            await heartbeat.wakeup(context.agentId, {
              source: "on_demand",
              triggerDetail: "callback",
              contextSnapshot: { issueId, channel: "android", peerId },
              payload: { text: messageText, peerId, peerLabel },
            });
          } catch (err) {
            logger.warn({ err, agentId: context.agentId }, "android channel wakeup failed");
          }

          sendJson(socket, {
            type: "reply",
            peer_id: peerId,
            text: "Message received. Agent notified.",
            issue_id: issueId,
          });
        } catch (err) {
          logger.error({ err }, "android channel message handling failed");
          sendError(socket, "internal_error", "Failed to process message");
        }
      })();
    });

    socket.on("close", () => {
      lastPongAtByClient.delete(socket);
      unregisterAndroidDeviceSocket(context.deviceRecordId, socket);
    });

    socket.on("error", (err) => {
      logger.warn({ err, deviceRecordId: context.deviceRecordId }, "android websocket client error");
    });
  });

  wss.on("close", () => {
    clearInterval(pingInterval);
  });

  server.on("upgrade", (req, socket, head) => {
    if (!req.url) return;

    const url = new URL(req.url, "http://localhost");
    if (url.pathname !== ANDROID_WS_PATH) return;

    const token = parseBearerToken(req.headers.authorization);
    if (!token) {
      rejectUpgrade(socket, "401 Unauthorized", "missing bearer token");
      return;
    }

    void channels
      .authenticateDeviceToken(token)
      .then((auth) => {
        if (!auth) {
          rejectUpgrade(socket, "403 Forbidden", "invalid device token");
          return;
        }

        const reqWithContext = req as IncomingMessageWithContext;
        reqWithContext.androidChannelContext = {
          deviceRecordId: auth.device.id,
          deviceId: auth.device.deviceId,
          agentId: auth.device.agentId,
          companyId: auth.device.companyId,
          connectionId: auth.connection.publicId,
          connectionRecordId: auth.device.connectionId,
        };

        wss.handleUpgrade(req, socket, head, (ws: WsSocket) => {
          wss.emit("connection", ws, reqWithContext);
        });
      })
      .catch((err) => {
        logger.error({ err }, "android websocket upgrade failed");
        rejectUpgrade(socket, "500 Internal Server Error", "upgrade failed");
      });
  });

  return {
    disconnectDevice: disconnectAndroidDeviceSockets,
  };
}


