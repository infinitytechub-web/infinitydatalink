import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { SectionCard } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import { CHANGE_KINDS, KIND_HINTS, KIND_LABELS, type ChangeKind } from "@/lib/change-approvals";
import { createChangeRequest } from "@/lib/change-approvals.functions";

export const Route = createFileRoute("/_admin/admin/change-approvals/new")({
  component: RequestChangePage,
});

function RequestChangePage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const submit = useServerFn(createChangeRequest);

  const [kind, setKind] = useState<ChangeKind>("branding");
  const [summary, setSummary] = useState("");
  const [payloadText, setPayloadText] = useState("{\n  \n}");

  const parsed = useMemo(() => {
    try {
      const value = JSON.parse(payloadText);
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return { ok: false as const, error: "Payload must be a JSON object" };
      }
      return { ok: true as const, value: value as Record<string, unknown> };
    } catch (error) {
      return { ok: false as const, error: (error as Error).message };
    }
  }, [payloadText]);

  const mutation = useMutation({
    mutationFn: () => submit({ data: { kind, summary, payload: parsed.ok ? parsed.value : {} } }),
    onSuccess: ({ id }) => {
      toast.success("Change request submitted for review");
      void queryClient.invalidateQueries({ queryKey: ["change-requests"] });
      void queryClient.invalidateQueries({ queryKey: ["change-audit-history"] });
      navigate({ to: "/admin/change-approvals/$id", params: { id } });
    },
    onError: (error: Error) =>
      toast.error(
        error.message.includes("forbidden")
          ? "You do not have permission to raise change requests."
          : error.message,
      ),
  });

  if (!can("approvals", "create")) {
    return (
      <SectionCard title="Request a change">
        <p className="p-6 text-sm text-muted-foreground">
          You have read-only access to change approvals. Ask an administrator for the “Change approvals → Create”
          permission to raise requests.
        </p>
      </SectionCard>
    );
  }

  const canSubmit = parsed.ok && summary.trim().length >= 5 && !mutation.isPending;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <SectionCard title="Request a change">
        <form
          className="space-y-5 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) mutation.mutate();
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="kind">Change kind</Label>
            <select
              id="kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as ChangeKind)}
              className="h-10 rounded-md border border-border bg-card px-3 text-sm"
            >
              {CHANGE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="summary">Summary</Label>
            <Input
              id="summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="What is changing and why?"
              maxLength={500}
            />
            <p className="text-[11px] text-muted-foreground">
              Shown to the reviewer. Minimum 5 characters.
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="payload">Change payload (JSON)</Label>
            <Textarea
              id="payload"
              value={payloadText}
              onChange={(e) => setPayloadText(e.target.value)}
              rows={12}
              spellCheck={false}
              className="font-mono text-xs"
            />
            <p className="text-[11px] text-muted-foreground">{KIND_HINTS[kind]}</p>
            {!parsed.ok ? <p className="text-[11px] text-rose-600">{parsed.error}</p> : null}
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={!canSubmit}>
              {mutation.isPending ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="mr-2 h-3.5 w-3.5" />
              )}
              Submit for review
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Nothing changes until a second reviewer approves.
            </p>
          </div>
        </form>
      </SectionCard>

      <SectionCard title="How review works" accent="none">
        <ol className="space-y-3 p-5 text-xs text-muted-foreground">
          <li>
            <span className="font-semibold text-foreground">1. Request.</span> You stage the change with a summary
            and payload. It is recorded in the audit history immediately.
          </li>
          <li>
            <span className="font-semibold text-foreground">2. Review.</span> A different reviewer with approve
            rights opens it under “Pending review”.
          </li>
          <li>
            <span className="font-semibold text-foreground">3. Decision.</span> Approve or reject with a mandatory
            comment. Approval applies the change in one transaction.
          </li>
          <li>
            <span className="font-semibold text-foreground">4. Apply / retry.</span> If applying fails, the request
            is marked failed with the error and can be retried from its detail screen.
          </li>
        </ol>
      </SectionCard>
    </div>
  );
}
