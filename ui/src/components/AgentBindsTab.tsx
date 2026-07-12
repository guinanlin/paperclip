import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, RefreshCw, Smartphone, Unlink } from "lucide-react";
import type { AgentChannelDevice, AndroidPairStartResult } from "@paperclipai/shared";
import { ApiError } from "../api/client";
import { agentChannelsApi } from "../api/agent-channels";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { cn } from "../lib/utils";

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "never";
  const deltaMs = Date.now() - new Date(iso).getTime();
  if (deltaMs < 0) return "just now";
  const sec = Math.floor(deltaMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
}

function Countdown({ expiresAt }: { expiresAt: string }) {
  const [remainingSec, setRemainingSec] = useState(() =>
    Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)),
  );

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRemainingSec(Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  const mm = String(Math.floor(remainingSec / 60)).padStart(2, "0");
  const ss = String(remainingSec % 60).padStart(2, "0");
  const expired = remainingSec <= 0;

  return (
    <span className={cn("font-mono text-sm", expired && "text-destructive")}>
      {expired ? "Expired" : `${mm}:${ss}`}
    </span>
  );
}

function DeviceRow({
  device,
  onRevoke,
  revoking,
}: {
  device: AgentChannelDevice;
  onRevoke: () => void;
  revoking: boolean;
}) {
  const revoked = Boolean(device.revokedAt);
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          {device.deviceName || device.deviceId}
        </p>
        <p className="text-xs text-muted-foreground">
          {device.deviceId}
          {device.appVersion ? ` · v${device.appVersion}` : ""}
          {" · last seen "}
          {formatRelativeTime(device.lastSeenAt)}
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled={revoked || revoking}
        onClick={onRevoke}
      >
        <Unlink className="mr-1 h-3.5 w-3.5" />
        {revoked ? "Revoked" : "Revoke"}
      </Button>
    </div>
  );
}

export function AgentBindsTab({
  agentId,
  companyId,
  agentName,
}: {
  agentId: string;
  companyId: string;
  agentName: string;
}) {
  const queryClient = useQueryClient();
  const [pairSession, setPairSession] = useState<AndroidPairStartResult | null>(null);
  const [pairError, setPairError] = useState<string | null>(null);
  const [pairErrorHints, setPairErrorHints] = useState<string[]>([]);
  const [copyState, setCopyState] = useState<string | null>(null);

  const devicesQuery = useQuery({
    queryKey: queryKeys.agents.androidDevices(agentId, companyId),
    queryFn: () => agentChannelsApi.listAndroidDevices(agentId),
  });

  const pollQuery = useQuery({
    queryKey: queryKeys.agents.androidPairPoll(agentId, pairSession?.loginId ?? "", companyId),
    queryFn: () => agentChannelsApi.pollAndroidPair(agentId, pairSession!.loginId),
    enabled: Boolean(pairSession?.loginId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (!pairSession) return false;
      if (status === "connected" || status === "expired" || status === "cancelled") return false;
      return 2000;
    },
  });

  const startPairMutation = useMutation({
    mutationFn: () =>
      agentChannelsApi.startAndroidPair(agentId, {
        connectionName: `${agentName} Android Channel`,
      }),
    onSuccess: (result) => {
      setPairError(null);
      setPairErrorHints([]);
      setPairSession(result);
    },
    onError: (err) => {
      setPairError(err instanceof Error ? err.message : "Failed to start pairing");
      if (err instanceof ApiError && err.body && typeof err.body === "object" && "details" in err.body) {
        const hints = (err.body as { details?: { hints?: string[] } }).details?.hints;
        setPairErrorHints(Array.isArray(hints) ? hints : []);
      } else {
        setPairErrorHints([]);
      }
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (deviceRecordId: string) =>
      agentChannelsApi.revokeAndroidDevice(agentId, deviceRecordId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.agents.androidDevices(agentId, companyId),
      });
    },
  });

  useEffect(() => {
    if (pollQuery.data?.status === "connected") {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.agents.androidDevices(agentId, companyId),
      });
    }
  }, [pollQuery.data?.status, agentId, companyId, queryClient]);

  const activeDevices = useMemo(
    () => (devicesQuery.data?.devices ?? []).filter((d) => !d.revokedAt),
    [devicesQuery.data?.devices],
  );

  const pairStatus = pollQuery.data?.status ?? (pairSession ? "pending" : null);

  async function copyText(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyState(label);
      window.setTimeout(() => setCopyState(null), 1500);
    } catch {
      setCopyState("Copy failed");
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Smartphone className="h-4 w-4" />
            Android Bind
          </CardTitle>
          <CardDescription>
            Generate a pairing code for an Android client to bind to this agent over WebSocket.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => startPairMutation.mutate()}
              disabled={startPairMutation.isPending}
            >
              {startPairMutation.isPending ? "Generating…" : "Generate pairing code"}
            </Button>
            {pairSession && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => startPairMutation.mutate()}
                disabled={startPairMutation.isPending}
              >
                <RefreshCw className="mr-1 h-3.5 w-3.5" />
                Regenerate
              </Button>
            )}
          </div>

          {pairError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <p className="font-medium text-destructive">无法生成配对码（二维码不会出现）</p>
              <p className="mt-1 text-destructive/90">{pairError}</p>
              {pairErrorHints.length > 0 && (
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-muted-foreground">修复后重启服务，再点 Generate pairing code：</p>
                  <pre className="overflow-x-auto rounded bg-muted px-2 py-1 text-xs">
                    {pairErrorHints.join("\n")}
                  </pre>
                </div>
              )}
            </div>
          )}

          {pairSession && (
            <div className="grid gap-4 md:grid-cols-[240px_1fr]">
              <div className="flex flex-col items-center gap-2 rounded-md border border-border p-4">
                {pairSession.qrBase64 ? (
                  <img
                    src={pairSession.qrBase64}
                    alt="Android pairing QR code"
                    className="h-48 w-48 rounded bg-white p-2"
                  />
                ) : (
                  <div className="flex h-48 w-48 items-center justify-center rounded border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                    QR preview unavailable — copy URL below
                  </div>
                )}
                <Countdown expiresAt={pairSession.expiresAt} />
              </div>

              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Pairing status</p>
                  <p className="font-medium capitalize">{pairStatus ?? "pending"}</p>
                  {pollQuery.data?.status === "connected" && (
                    <p className="text-xs text-muted-foreground">
                      Device {pollQuery.data.deviceName ?? pollQuery.data.deviceId} connected
                    </p>
                  )}
                </div>

                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">pairingBaseUrl</p>
                  <div className="mt-1 flex items-center gap-2">
                    <code className="flex-1 truncate rounded bg-muted px-2 py-1 text-xs">
                      {pairSession.pairingBaseUrl}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => void copyText("baseUrl", pairSession.pairingBaseUrl)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  {copyState === "baseUrl" && (
                    <p className="text-xs text-muted-foreground">Copied</p>
                  )}
                </div>

                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">qrUrl</p>
                  <div className="mt-1 flex items-start gap-2">
                    <code className="flex-1 break-all rounded bg-muted px-2 py-1 text-xs">
                      {pairSession.qrUrl}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => void copyText("qrUrl", pairSession.qrUrl)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  {copyState === "qrUrl" && (
                    <p className="text-xs text-muted-foreground">Copied</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bound devices</CardTitle>
          <CardDescription>
            {activeDevices.length} active device{activeDevices.length === 1 ? "" : "s"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {devicesQuery.isLoading && (
            <p className="text-sm text-muted-foreground">Loading devices…</p>
          )}
          {devicesQuery.isError && (
            <p className="text-sm text-destructive">Failed to load devices</p>
          )}
          {!devicesQuery.isLoading && activeDevices.length === 0 && (
            <p className="text-sm text-muted-foreground">No bound Android devices yet.</p>
          )}
          {activeDevices.map((device) => (
            <DeviceRow
              key={device.id}
              device={device}
              revoking={revokeMutation.isPending}
              onRevoke={() => revokeMutation.mutate(device.id)}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
