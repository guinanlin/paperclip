import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { skillsApi } from "../api/skills";
import { queryKeys } from "../lib/queryKeys";
import { useToast } from "../context/ToastContext";
import { ApiError } from "../api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, RefreshCw, Unlink } from "lucide-react";
import { Link } from "@/lib/router";

function modeLabel(mode: string): string {
  switch (mode) {
    case "persistent":
      return "Persistent";
    case "ephemeral":
      return "Ephemeral";
    case "unsupported":
      return "Unsupported";
    default:
      return mode;
  }
}

export function AgentSkillsPanel({
  companyId,
  agentId,
}: {
  companyId: string;
  agentId: string;
}) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [pickSlug, setPickSlug] = useState<string>("");

  const libraryQuery = useQuery({
    queryKey: queryKeys.skills.company(companyId),
    queryFn: () => skillsApi.listCompanySkills(companyId),
  });

  const attachmentsQuery = useQuery({
    queryKey: queryKeys.skills.agentAttachments(companyId, agentId),
    queryFn: () => skillsApi.listAgentAttachments(companyId, agentId),
  });

  const syncStateQuery = useQuery({
    queryKey: queryKeys.skills.agentSync(companyId, agentId),
    queryFn: () => skillsApi.getAgentSkillSyncState(companyId, agentId),
  });

  const attachMut = useMutation({
    mutationFn: (skillSlug: string) => skillsApi.attachAgentSkill(companyId, agentId, skillSlug),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.skills.agentAttachments(companyId, agentId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.skills.agentSync(companyId, agentId) });
      setPickSlug("");
      pushToast({ title: "Skill attached", tone: "success" });
    },
    onError: (err) => {
      pushToast({
        title: "Attach failed",
        body: err instanceof Error ? err.message : "Unknown error",
        tone: "error",
      });
    },
  });

  const detachMut = useMutation({
    mutationFn: (skillSlug: string) => skillsApi.detachAgentSkill(companyId, agentId, skillSlug),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.skills.agentAttachments(companyId, agentId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.skills.agentSync(companyId, agentId) });
      pushToast({ title: "Skill detached", tone: "success" });
    },
    onError: (err) => {
      pushToast({
        title: "Detach failed",
        body: err instanceof Error ? err.message : "Unknown error",
        tone: "error",
      });
    },
  });

  const syncMut = useMutation({
    mutationFn: () => skillsApi.syncAgentSkills(companyId, agentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.skills.agentSync(companyId, agentId) });
      pushToast({ title: "Skills synced", tone: "success" });
    },
    onError: (err) => {
      const msg =
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Unknown error";
      pushToast({ title: "Sync not available", body: msg, tone: "error" });
    },
  });

  const attachedSlugs = useMemo(
    () => new Set((attachmentsQuery.data ?? []).map((a) => a.skillSlug.toLowerCase())),
    [attachmentsQuery.data],
  );

  const attachOptions = useMemo(
    () => (libraryQuery.data ?? []).filter((s) => !attachedSlugs.has(s.slug.toLowerCase())),
    [libraryQuery.data, attachedSlugs],
  );

  const sync = syncStateQuery.data;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Adapter sync</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {syncStateQuery.isLoading && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading sync state…
            </div>
          )}
          {syncStateQuery.error && (
            <p className="text-destructive text-sm">{(syncStateQuery.error as Error).message}</p>
          )}
          {sync && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">Mode</span>
                <span className="font-medium">{modeLabel(sync.mode)}</span>
                {sync.adapterType ? (
                  <>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground">{sync.adapterType}</span>
                  </>
                ) : null}
              </div>
              {sync.skillsHome ? (
                <p className="text-xs text-muted-foreground break-all">
                  Skills home: <code className="text-[11px]">{sync.skillsHome}</code>
                </p>
              ) : null}
              {sync.message ? <p className="text-xs text-muted-foreground">{sync.message}</p> : null}
              {sync.sharedHomeNote ? (
                <p className="text-xs text-amber-600 dark:text-amber-400">{sync.sharedHomeNote}</p>
              ) : null}
              {sync.mode !== "unsupported" && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={syncMut.isPending}
                    onClick={() => syncMut.mutate()}
                  >
                    {syncMut.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    <span className="ml-1.5">Sync to disk</span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={syncStateQuery.isFetching}
                    onClick={() => void syncStateQuery.refetch()}
                  >
                    Refresh state
                  </Button>
                </div>
              )}
              {sync.entries.length > 0 && (
                <div className="border border-border rounded-md overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left font-medium px-3 py-2">Skill</th>
                        <th className="text-left font-medium px-3 py-2">On disk</th>
                        <th className="text-left font-medium px-3 py-2">Desired</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sync.entries.map((e) => (
                        <tr key={e.slug} className="border-t border-border">
                          <td className="px-3 py-1.5 font-mono">{e.slug}</td>
                          <td className="px-3 py-1.5">{e.present ? "Yes" : "No"}</td>
                          <td className="px-3 py-1.5">{e.desired ? "Yes" : "No"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Attached skills</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1 min-w-[200px] flex-1">
              <span className="text-xs text-muted-foreground">Add from company library</span>
              <Select
                value={pickSlug || undefined}
                onValueChange={setPickSlug}
                disabled={attachOptions.length === 0 || attachMut.isPending}
              >
                <SelectTrigger>
                  <SelectValue placeholder={attachOptions.length === 0 ? "No skills to add" : "Choose skill"} />
                </SelectTrigger>
                <SelectContent>
                  {attachOptions.map((s) => (
                    <SelectItem key={s.id} value={s.slug}>
                      {s.slug} — {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              size="sm"
              disabled={!pickSlug || attachMut.isPending}
              onClick={() => pickSlug && attachMut.mutate(pickSlug)}
            >
              Attach
            </Button>
          </div>
          {libraryQuery.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No company skills yet. Add definitions on the{" "}
              <Link to="/skills" className="underline">
                Skills
              </Link>{" "}
              page.
            </p>
          )}
          <div className="divide-y divide-border border border-border rounded-md">
            {(attachmentsQuery.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground p-3">No skills attached to this agent.</p>
            ) : (
              (attachmentsQuery.data ?? []).map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="font-mono truncate">{a.skillSlug}</div>
                    {a.libraryName ? (
                      <div className="text-xs text-muted-foreground truncate">{a.libraryName}</div>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    title="Detach"
                    disabled={detachMut.isPending}
                    onClick={() => detachMut.mutate(a.skillSlug)}
                  >
                    <Unlink className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
