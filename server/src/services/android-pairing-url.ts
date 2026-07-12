import type { Request } from "express";
import os from "node:os";
import { unprocessable } from "../errors.js";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);
const DOCKER_IPV4_PREFIXES = ["172.17.", "172.18.", "172.19.", "172.20.", "172.21.", "172.22.", "172.23.", "172.24.", "172.25."];

export interface PairingUrlResolution {
  baseUrl: string;
  source: "lan_host" | "explicit_base_url" | "public_app_url" | "request";
}

function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "";
  }
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  if (LOOPBACK_HOSTS.has(normalized)) return true;
  if (normalized.startsWith("127.")) return true;
  return false;
}

function assertReachableBaseUrl(baseUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw unprocessable("Invalid pairing base URL", { baseUrl });
  }

  if (isLoopbackHost(parsed.hostname)) {
    throw unprocessable(
      "Pairing base URL must be reachable from a mobile device (loopback hosts are not allowed). " +
        "Set ANDROID_BIND_PAIRING_LAN_HOST or ANDROID_BIND_PAIRING_BASE_URL to your LAN IP or public URL.",
      {
        hostname: parsed.hostname,
        hints: [
          "export ANDROID_BIND_PAIRING_LAN_HOST=192.168.x.x",
          "export ANDROID_BIND_PAIRING_BASE_URL=https://paperclip.example.com",
        ],
      },
    );
  }

  return `${parsed.protocol}//${parsed.host}`;
}

export function requestBaseUrl(req: Request): string {
  const forwardedProto = req.header("x-forwarded-proto");
  const proto = forwardedProto?.split(",")[0]?.trim() || req.protocol || "http";
  const host =
    req.header("x-forwarded-host")?.split(",")[0]?.trim() || req.header("host");
  if (!host) return "";
  return `${proto}://${host}`;
}

function getListenHost(): string {
  return (
    process.env.PAPERCLIP_LISTEN_HOST?.trim() ||
    process.env.HOST?.trim() ||
    "127.0.0.1"
  );
}

function isLoopbackListenHost(host: string): boolean {
  const normalized = host.toLowerCase();
  return normalized === "127.0.0.1" || normalized === "localhost" || normalized === "::1";
}

export function listLocalIpv4Addresses(): string[] {
  const result: string[] = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    if (!entries) continue;
    for (const entry of entries) {
      const family = entry.family as string | number;
      if (family !== "IPv4" && family !== 4) continue;
      if (!entry.address || entry.internal) continue;
      result.push(entry.address);
    }
  }
  return result;
}

function suggestLanHost(localIps: string[]): string | null {
  const ranked = [...localIps].sort((left, right) => {
    const score = (ip: string) => {
      if (ip.startsWith("192.168.")) return 0;
      if (ip.startsWith("10.")) return 2;
      if (DOCKER_IPV4_PREFIXES.some((prefix) => ip.startsWith(prefix))) return 4;
      return 3;
    };
    return score(left) - score(right) || left.localeCompare(right);
  });
  return ranked[0] ?? null;
}

function isLikelyVpnOrDockerHost(hostname: string, localIps: string[]): boolean {
  if (!localIps.includes(hostname)) return true;
  if (DOCKER_IPV4_PREFIXES.some((prefix) => hostname.startsWith(prefix))) return true;
  return false;
}

/** Ensure QR host is reachable when the API process only binds loopback. */
export function validateAndroidPairingListenSetup(pairingBaseUrl: string): void {
  const listenHost = getListenHost();
  if (!isLoopbackListenHost(listenHost)) return;

  const parsed = new URL(pairingBaseUrl);
  if (isLoopbackHost(parsed.hostname)) return;

  const localIps = listLocalIpv4Addresses();
  const pairingHostname = parsed.hostname;
  const suggested = suggestLanHost(localIps);
  const hostLooksWrong = isLikelyVpnOrDockerHost(pairingHostname, localIps);

  const hostHint = hostLooksWrong
    ? ` ANDROID_BIND_PAIRING_LAN_HOST=${pairingHostname} 看起来不是手机可直连的 WiFi 地址（常见误用 VPN/tun0 或 Docker 网桥）。`
    : "";

  throw unprocessable(
    `Paperclip 当前只监听 ${listenHost}，手机无法连接 ${parsed.host}。${hostHint}` +
      ` 请设置 HOST=0.0.0.0 后重启服务，并将 ANDROID_BIND_PAIRING_LAN_HOST 设为与手机同一局域网的 IP` +
      (suggested ? `（建议：${suggested}）` : "") +
      "。",
    {
      listenHost,
      pairingHost: parsed.host,
      configuredLanHost: process.env.ANDROID_BIND_PAIRING_LAN_HOST ?? null,
      localIps,
      hints: [
        "export HOST=0.0.0.0",
        "export PAPERCLIP_LOCAL_TRUSTED_ALLOW_NON_LOOPBACK_BIND=true",
        suggested
          ? `export ANDROID_BIND_PAIRING_LAN_HOST=${suggested}`
          : "export ANDROID_BIND_PAIRING_LAN_HOST=192.168.x.x",
        "# 或手机走 OpenVPN 时：",
        "export ANDROID_BIND_PAIRING_ALLOW_VPN_HOST=true",
        `export ANDROID_BIND_PAIRING_LAN_HOST=${pairingHostname}`,
        "pnpm dev",
      ],
    },
  );
}

export function resolveAndroidPairingBaseUrl(req: Request): PairingUrlResolution {
  const lanHost = process.env.ANDROID_BIND_PAIRING_LAN_HOST?.trim();
  if (lanHost) {
    const port = process.env.PAPERCLIP_LISTEN_PORT?.trim() || String(process.env.PORT ?? "3100");
    const hostWithPort = lanHost.includes(":") ? lanHost : `${lanHost}:${port}`;
    return {
      baseUrl: assertReachableBaseUrl(`http://${hostWithPort}`),
      source: "lan_host",
    };
  }

  const explicit = process.env.ANDROID_BIND_PAIRING_BASE_URL?.trim();
  if (explicit) {
    return {
      baseUrl: assertReachableBaseUrl(normalizeBaseUrl(explicit)),
      source: "explicit_base_url",
    };
  }

  const publicAppUrl = process.env.PUBLIC_APP_URL?.trim();
  if (publicAppUrl) {
    return {
      baseUrl: assertReachableBaseUrl(normalizeBaseUrl(publicAppUrl)),
      source: "public_app_url",
    };
  }

  const fromRequest = normalizeBaseUrl(requestBaseUrl(req));
  if (!fromRequest) {
    throw unprocessable(
      "Unable to resolve pairing base URL. Configure ANDROID_BIND_PAIRING_LAN_HOST or ANDROID_BIND_PAIRING_BASE_URL.",
    );
  }

  return {
    baseUrl: assertReachableBaseUrl(fromRequest),
    source: "request",
  };
}

function allowsVpnPairingHost(): boolean {
  return process.env.ANDROID_BIND_PAIRING_ALLOW_VPN_HOST?.trim().toLowerCase() === "true";
}

function validateAndroidPairingLanHostChoice(pairing: PairingUrlResolution): void {
  if (pairing.source !== "lan_host") return;
  if (allowsVpnPairingHost()) return;

  const parsed = new URL(pairing.baseUrl);
  const localIps = listLocalIpv4Addresses();
  const suggested = suggestLanHost(localIps);
  if (!suggested || parsed.hostname === suggested) return;

  const configured = parsed.hostname;
  const looksLikeVpnWhileWifiAvailable =
    configured.startsWith("10.") && suggested.startsWith("192.168.");

  if (!looksLikeVpnWhileWifiAvailable) return;

  throw unprocessable(
    `ANDROID_BIND_PAIRING_LAN_HOST=${configured} 多半是 VPN/tun0 地址，手机若未连接同一 VPN 会出现 fail to connect。` +
      ` 请改用与手机同一 WiFi 的局域网 IP（建议 ${suggested}），或确认手机已连同一 OpenVPN 后设置 ` +
      `ANDROID_BIND_PAIRING_ALLOW_VPN_HOST=true。`,
    {
      configuredLanHost: configured,
      suggestedLanHost: suggested,
      localIps,
      hints: [
        "export HOST=0.0.0.0",
        "export PAPERCLIP_LOCAL_TRUSTED_ALLOW_NON_LOOPBACK_BIND=true",
        `export ANDROID_BIND_PAIRING_LAN_HOST=${suggested}`,
        "# 手机已通过 OpenVPN 访问本机时：",
        "export ANDROID_BIND_PAIRING_ALLOW_VPN_HOST=true",
        `export ANDROID_BIND_PAIRING_LAN_HOST=${configured}`,
        "pnpm dev",
      ],
    },
  );
}

export function resolveAndroidPairingBaseUrlForMobile(req: Request): PairingUrlResolution {
  const pairing = resolveAndroidPairingBaseUrl(req);
  validateAndroidPairingListenSetup(pairing.baseUrl);
  validateAndroidPairingLanHostChoice(pairing);
  return pairing;
}

export function buildAndroidWebSocketUrl(baseUrl: string): string {
  const parsed = new URL(baseUrl);
  parsed.protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
  parsed.pathname = "/api/channel/android/ws";
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}

export function buildAndroidPairQrUrl(input: {
  pairingBaseUrl: string;
  loginId: string;
  connectionId: number;
  agentId?: string;
}): string {
  const url = new URL("/channel/android/pair", input.pairingBaseUrl);
  url.searchParams.set("login_id", input.loginId);
  url.searchParams.set("connection_id", String(input.connectionId));
  if (input.agentId) {
    url.searchParams.set("agent_id", input.agentId);
  }
  return url.toString();
}

export { isLoopbackHost, assertReachableBaseUrl };
