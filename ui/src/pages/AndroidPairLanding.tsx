import { useMemo } from "react";
import { useSearchParams } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import type { AndroidPairLookupResult } from "@paperclipai/shared";
import { api } from "../api/client";

function readParam(params: URLSearchParams, key: string) {
  return params.get(key)?.trim() ?? "";
}

export function AndroidPairLandingPage() {
  const [searchParams] = useSearchParams();
  const loginId = useMemo(() => readParam(searchParams, "login_id"), [searchParams]);
  const connectionId = useMemo(() => readParam(searchParams, "connection_id"), [searchParams]);
  const agentId = useMemo(() => readParam(searchParams, "agent_id"), [searchParams]);

  const lookupQuery = useQuery({
    queryKey: ["android-pair-lookup", loginId, connectionId],
    queryFn: () =>
      api.get<AndroidPairLookupResult>(
        `/channel/android/pair/lookup?login_id=${encodeURIComponent(loginId)}&connection_id=${encodeURIComponent(connectionId)}`,
      ),
    enabled: loginId.length > 0 && connectionId.length > 0,
    retry: false,
  });

  const missingParams = !loginId || !connectionId;

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 p-6">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">Paperclip Android 绑定</h1>
        <p className="text-sm text-muted-foreground">
          此二维码用于将 Android 客户端绑定到 Paperclip Agent。请使用已对接的 Paperclip Android App 扫码，而不是系统浏览器完成配对。
        </p>
      </div>

      {missingParams && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          二维码参数不完整：缺少 <code>login_id</code> 或 <code>connection_id</code>。请在 Agent 详情页的 Binds Tab 重新生成配对码。
        </div>
      )}

      {!missingParams && lookupQuery.isLoading && (
        <p className="text-sm text-muted-foreground">正在校验配对信息…</p>
      )}

      {!missingParams && lookupQuery.data && !lookupQuery.data.valid && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {lookupQuery.data.error ?? "connection_id 无效或配对会话不存在"}
        </div>
      )}

      {!missingParams && lookupQuery.data?.valid && (
        <div className="space-y-3 rounded-md border border-border p-4 text-sm">
          <p>
            配对状态：<span className="font-medium capitalize">{lookupQuery.data.status}</span>
          </p>
          <p>
            连接 ID：<code>{lookupQuery.data.connectionId}</code>
          </p>
          {agentId && (
            <p>
              Agent ID：<code className="break-all">{agentId}</code>
            </p>
          )}
          {lookupQuery.data.expiresAt && (
            <p className="text-muted-foreground">
              过期时间：{new Date(lookupQuery.data.expiresAt).toLocaleString()}
            </p>
          )}
          <p className="text-muted-foreground">
            若 App 尚未打开，请安装/启动 Paperclip Android 客户端后重新扫码；浏览器无法代替 App 完成绑定。
          </p>
        </div>
      )}

      {!missingParams && lookupQuery.isError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          无法连接 Paperclip 服务校验配对信息。请确认手机与 Paperclip 在同一局域网，且服务端已配置{" "}
          <code>ANDROID_BIND_PAIRING_LAN_HOST</code>。
        </div>
      )}
    </div>
  );
}
