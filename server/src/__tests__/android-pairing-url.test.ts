import { describe, expect, it, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import {
  assertReachableBaseUrl,
  buildAndroidPairQrUrl,
  buildAndroidWebSocketUrl,
  isLoopbackHost,
  requestBaseUrl,
  resolveAndroidPairingBaseUrlForMobile,
  validateAndroidPairingListenSetup,
} from "../services/android-pairing-url.js";

describe("android-pairing-url", () => {
  it("detects loopback hosts", () => {
    expect(isLoopbackHost("localhost")).toBe(true);
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isLoopbackHost("192.168.1.10")).toBe(false);
  });

  it("rejects loopback base URLs", () => {
    expect(() => assertReachableBaseUrl("http://127.0.0.1:3100")).toThrow(/loopback/i);
  });

  it("builds websocket and qr URLs", () => {
    expect(buildAndroidWebSocketUrl("https://paperclip.example.com")).toBe(
      "wss://paperclip.example.com/api/channel/android/ws",
    );

    const qrUrl = buildAndroidPairQrUrl({
      pairingBaseUrl: "https://paperclip.example.com",
      loginId: "550e8400-e29b-41d4-a716-446655440000",
      connectionId: 12,
      agentId: "agent-1",
    });
    expect(qrUrl).toContain("connection_id=12");
    expect(qrUrl).toContain("/channel/android/pair?");
    expect(qrUrl).toContain("login_id=550e8400-e29b-41d4-a716-446655440000");
  });

  it("derives request base URL from forwarded headers", async () => {
    const app = express();
    app.get("/probe", (req, res) => {
      res.json({ baseUrl: requestBaseUrl(req) });
    });

    const res = await request(app)
      .get("/probe")
      .set("Host", "paperclip.example.com")
      .set("X-Forwarded-Proto", "https");

    expect(res.body.baseUrl).toBe("https://paperclip.example.com");
  });

  describe("validateAndroidPairingListenSetup", () => {
    const envSnapshot = { ...process.env };

    afterEach(() => {
      process.env = { ...envSnapshot };
    });

    it("rejects loopback listen with external pairing host", () => {
      process.env.HOST = "127.0.0.1";
      delete process.env.PAPERCLIP_LISTEN_HOST;
      expect(() => validateAndroidPairingListenSetup("http://10.253.32.200:3100")).toThrow(
        /只监听 127\.0\.0\.1/,
      );
    });

    it("allows external pairing host when listening on 0.0.0.0", () => {
      process.env.HOST = "0.0.0.0";
      expect(() => validateAndroidPairingListenSetup("http://192.168.1.42:3100")).not.toThrow();
    });
  });

  describe("resolveAndroidPairingBaseUrlForMobile VPN host", () => {
    const envSnapshot = { ...process.env };

    afterEach(() => {
      process.env = { ...envSnapshot };
    });

    it("blocks VPN LAN host by default when WiFi IP exists", () => {
      process.env.HOST = "0.0.0.0";
      process.env.ANDROID_BIND_PAIRING_LAN_HOST = "10.253.32.200";
      delete process.env.ANDROID_BIND_PAIRING_ALLOW_VPN_HOST;

      const req = { protocol: "http", header: () => undefined } as Parameters<
        typeof resolveAndroidPairingBaseUrlForMobile
      >[0];

      expect(() => resolveAndroidPairingBaseUrlForMobile(req)).toThrow(/VPN\/tun0/);
    });

    it("allows VPN LAN host when ANDROID_BIND_PAIRING_ALLOW_VPN_HOST=true", () => {
      process.env.HOST = "0.0.0.0";
      process.env.ANDROID_BIND_PAIRING_LAN_HOST = "10.253.32.200";
      process.env.ANDROID_BIND_PAIRING_ALLOW_VPN_HOST = "true";

      const req = { protocol: "http", header: () => undefined } as Parameters<
        typeof resolveAndroidPairingBaseUrlForMobile
      >[0];

      const result = resolveAndroidPairingBaseUrlForMobile(req);
      expect(result.baseUrl).toBe("http://10.253.32.200:3100");
      expect(result.source).toBe("lan_host");
    });
  });
});
