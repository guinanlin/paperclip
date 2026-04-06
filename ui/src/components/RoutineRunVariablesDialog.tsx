import { useEffect, useMemo, useState } from "react";
import type { IssueExecutionWorkspaceSettings, Project, RoutineVariable } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

function buildInitialValues(variables: RoutineVariable[]) {
  return Object.fromEntries(variables.map((variable) => [variable.name, variable.defaultValue ?? ""]));
}

function isMissingRequiredValue(value: unknown) {
  return value == null || (typeof value === "string" && value.trim().length === 0);
}

export function routineRunNeedsConfiguration(input: {
  variables: RoutineVariable[];
  project: Project | null | undefined;
  isolatedWorkspacesEnabled: boolean;
}) {
  void input.project;
  void input.isolatedWorkspacesEnabled;
  return input.variables.length > 0;
}

export interface RoutineRunDialogSubmitData {
  variables?: Record<string, string | number | boolean>;
  executionWorkspaceSettings?: IssueExecutionWorkspaceSettings | null;
}

export function RoutineRunVariablesDialog({
  open,
  onOpenChange,
  companyId: _companyId,
  project: _project,
  variables,
  isPending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null | undefined;
  project: Project | null | undefined;
  variables: RoutineVariable[];
  isPending: boolean;
  onSubmit: (data: RoutineRunDialogSubmitData) => void;
}) {
  const [values, setValues] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (!open) return;
    setValues(buildInitialValues(variables));
  }, [open, variables]);

  const missingRequired = useMemo(
    () =>
      variables
        .filter((variable) => variable.required)
        .filter((variable) => isMissingRequiredValue(values[variable.name]))
        .map((variable) => variable.label || variable.name),
    [values, variables],
  );

  const canSubmit = missingRequired.length === 0;

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Run routine</DialogTitle>
          <DialogDescription>
            Fill in the routine variables before starting the execution issue.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {variables.map((variable) => (
            <div key={variable.name} className="space-y-1.5">
              <Label className="text-xs">
                {variable.label || variable.name}
                {variable.required ? " *" : ""}
              </Label>
              {variable.type === "textarea" ? (
                <Textarea
                  rows={4}
                  value={typeof values[variable.name] === "string" ? (values[variable.name] as string) : ""}
                  onChange={(event) => setValues((current) => ({ ...current, [variable.name]: event.target.value }))}
                />
              ) : variable.type === "boolean" ? (
                <Select
                  value={values[variable.name] === true ? "true" : values[variable.name] === false ? "false" : "__unset__"}
                  onValueChange={(next) =>
                    setValues((current) => ({
                      ...current,
                      [variable.name]: next === "__unset__" ? "" : next === "true",
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__unset__">No value</SelectItem>
                    <SelectItem value="true">True</SelectItem>
                    <SelectItem value="false">False</SelectItem>
                  </SelectContent>
                </Select>
              ) : variable.type === "select" ? (
                <Select
                  value={
                    typeof values[variable.name] === "string" && values[variable.name]
                      ? (values[variable.name] as string)
                      : "__unset__"
                  }
                  onValueChange={(next) =>
                    setValues((current) => ({
                      ...current,
                      [variable.name]: next === "__unset__" ? "" : next,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a value" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__unset__">No value</SelectItem>
                    {variable.options.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  type={variable.type === "number" ? "number" : "text"}
                  value={values[variable.name] == null ? "" : String(values[variable.name])}
                  onChange={(event) => setValues((current) => ({ ...current, [variable.name]: event.target.value }))}
                />
              )}
            </div>
          ))}
        </div>

        <DialogFooter showCloseButton={false}>
          {missingRequired.length > 0 ? (
            <p className="mr-auto text-xs text-amber-600">Missing: {missingRequired.join(", ")}</p>
          ) : (
            <span className="mr-auto" />
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              const nextVariables: Record<string, string | number | boolean> = {};
              for (const variable of variables) {
                const rawValue = values[variable.name];
                if (isMissingRequiredValue(rawValue)) continue;
                if (variable.type === "number") {
                  nextVariables[variable.name] = Number(rawValue);
                } else if (variable.type === "boolean") {
                  nextVariables[variable.name] = rawValue === true;
                } else {
                  nextVariables[variable.name] = String(rawValue);
                }
              }
              onSubmit({ variables: nextVariables });
            }}
            disabled={isPending || !canSubmit}
          >
            {isPending ? "Running..." : "Run routine"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
