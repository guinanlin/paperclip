import { createHash } from "node:crypto";
import type { Duplex } from "node:stream";

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export { hashToken as hashAndroidDeviceToken };

interface AndroidSocket {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  terminate(): void;
}

const socketsByDeviceRecordId = new Map<string, Set<AndroidSocket>>();

export function registerAndroidDeviceSocket(deviceRecordId: string, socket: AndroidSocket) {
  const existing = socketsByDeviceRecordId.get(deviceRecordId) ?? new Set();
  existing.add(socket);
  socketsByDeviceRecordId.set(deviceRecordId, existing);
}

export function unregisterAndroidDeviceSocket(deviceRecordId: string, socket: AndroidSocket) {
  const sockets = socketsByDeviceRecordId.get(deviceRecordId);
  if (!sockets) return;
  sockets.delete(socket);
  if (sockets.size === 0) {
    socketsByDeviceRecordId.delete(deviceRecordId);
  }
}

export function disconnectAndroidDeviceSockets(deviceRecordId: string) {
  const sockets = socketsByDeviceRecordId.get(deviceRecordId);
  if (!sockets) return;

  for (const socket of sockets) {
    try {
      socket.close(1008, "device revoked");
    } catch {
      socket.terminate();
    }
  }
  socketsByDeviceRecordId.delete(deviceRecordId);
}

export function _resetAndroidDeviceSocketRegistryForTests() {
  socketsByDeviceRecordId.clear();
}
