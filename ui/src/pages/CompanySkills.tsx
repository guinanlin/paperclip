import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { skillsApi } from "../api/skills";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Trash2 } from "lucide-react";
import { useToast } from "../context/ToastContext";

export function CompanySkills() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    setBreadcrumbs([{ label: "Skills" }]);
  }, [setBreadcrumbs]);

  const listQuery = useQuery({
    queryKey: queryKeys.skills.company(selectedCompanyId!),
    queryFn: () => skillsApi.listCompanySkills(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const createMut = useMutation({
    mutationFn: () =>
      skillsApi.createCompanySkill(selectedCompanyId!, {
        slug: slug.trim(),
        name: name.trim(),
        description: description.trim() || null,
        sourceType: "manual",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.skills.company(selectedCompanyId!) });
      setSlug("");
      setName("");
      setDescription("");
      pushToast({ title: "Skill created", tone: "success" });
    },
    onError: (err) => {
      pushToast({
        title: "Create failed",
        body: err instanceof Error ? err.message : "Unknown error",
        tone: "error",
      });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (skillId: string) => skillsApi.deleteCompanySkill(selectedCompanyId!, skillId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.skills.company(selectedCompanyId!) });
      pushToast({ title: "Skill removed", tone: "success" });
    },
    onError: (err) => {
      pushToast({
        title: "Delete failed",
        body: err instanceof Error ? err.message : "Unknown error",
        tone: "error",
      });
    },
  });

  if (!selectedCompanyId) {
    return <EmptyState icon={Sparkles} message="Select a company to manage skills." />;
  }

  if (listQuery.isLoading) {
    return <PageSkeleton variant="detail" />;
  }

  if (listQuery.error) {
    return <p className="text-sm text-destructive">{(listQuery.error as Error).message}</p>;
  }

  const rows = listQuery.data ?? [];

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Company skills</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Define skill slugs for your company library, then attach them to agents on each agent&apos;s Skills tab.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Add skill</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground" htmlFor="skill-slug">
                Slug
              </label>
              <Input
                id="skill-slug"
                placeholder="e.g. deploy"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground" htmlFor="skill-name">
                Display name
              </label>
              <Input
                id="skill-name"
                placeholder="e.g. Deploy pipeline"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground" htmlFor="skill-desc">
              Description (optional)
            </label>
            <Textarea
              id="skill-desc"
              rows={2}
              placeholder="What this skill is for"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <Button
            type="button"
            disabled={!slug.trim() || !name.trim() || createMut.isPending}
            onClick={() => createMut.mutate()}
          >
            {createMut.isPending ? "Saving…" : "Create skill"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Library ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No skills yet.</p>
          ) : (
            <ul className="divide-y divide-border border border-border rounded-md">
              {rows.map((row) => (
                <li key={row.id} className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <div className="font-mono text-xs">{row.slug}</div>
                    <div className="font-medium">{row.name}</div>
                    {row.description ? (
                      <p className="text-xs text-muted-foreground mt-0.5">{row.description}</p>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    title="Delete"
                    disabled={deleteMut.isPending}
                    onClick={() => deleteMut.mutate(row.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
