import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Eye, EyeOff, Fingerprint, Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { startStepUp } from "@/lib/step-up.functions";
import {
  clearStepUpToken,
  getStepUpExpiry,
  getStepUpToken,
  setStepUpToken,
  subscribeStepUp,
} from "@/lib/step-up-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Pending = {
  label: string;
  resolve: (token: string) => void;
  reject: (err: Error) => void;
};

function useStepUpExpiry() {
  return useSyncExternalStore(
    subscribeStepUp,
    () => getStepUpExpiry(),
    () => 0,
  );
}

/**
 * Gate sensitive approve/reject actions behind a fresh re-authentication.
 *
 *   const { ensure, dialog } = useStepUp();
 *   const token = await ensure("approve loan LN-1024");
 *   await decide({ data: { ..., step_up_token: token } });
 *   ... render {dialog}
 */
export function useStepUp() {
  const [pending, setPending] = useState<Pending | null>(null);
  const expiry = useStepUpExpiry();
  const pendingRef = useRef<Pending | null>(null);
  pendingRef.current = pending;

  const ensure = useCallback((label: string) => {
    const existing = getStepUpToken();
    if (existing) return Promise.resolve(existing);
    return new Promise<string>((resolve, reject) => {
      setPending({ label, resolve, reject });
    });
  }, []);

  const handleDone = useCallback((token: string) => {
    pendingRef.current?.resolve(token);
    setPending(null);
  }, []);

  const handleCancel = useCallback(() => {
    pendingRef.current?.reject(new Error("Re-authentication cancelled"));
    setPending(null);
  }, []);

  const dialog = (
    <StepUpDialog
      open={!!pending}
      label={pending?.label ?? ""}
      onDone={handleDone}
      onCancel={handleCancel}
    />
  );

  return { ensure, dialog, active: expiry > Date.now(), expiresAt: expiry };
}

export function StepUpDialog({
  open,
  label,
  onDone,
  onCancel,
}: {
  open: boolean;
  label: string;
  onDone: (token: string) => void;
  onCancel: () => void;
}) {
  const start = useServerFn(startStepUp);
  const [tab, setTab] = useState<"password" | "totp">("password");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setPassword("");
      setCode("");
      setError(null);
      setBusy(false);
      return;
    }
    let cancelled = false;
    supabase.auth.mfa
      .listFactors()
      .then(({ data }) => {
        if (cancelled) return;
        const verified = data?.totp?.find((f: any) => f.status === "verified");
        setFactorId(verified?.id ?? null);
      })
      .catch(() => setFactorId(null));
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (tab === "totp") {
        if (!factorId)
          throw new Error("No verified authenticator app is enrolled on this account.");
        const { error: mfaError } = await supabase.auth.mfa.challengeAndVerify({
          factorId,
          code: code.trim(),
        });
        if (mfaError) throw new Error(mfaError.message);
      }
      const res = await start({
        data:
          tab === "password"
            ? { method: "password", password, reason: label }
            : { method: "totp", reason: label },
      });
      setStepUpToken(res.token, res.expires_at);
      onDone(res.token);
    } catch (e: any) {
      clearStepUpToken();
      setError(e?.message ?? "Re-authentication failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onCancel() : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
            Confirm your identity
          </DialogTitle>
          <DialogDescription>
            This action is recorded in the compliance audit trail. Re-authenticate to continue
            {label ? ` — ${label}.` : "."}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "password" | "totp")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="password">Password</TabsTrigger>
            <TabsTrigger value="totp">
              <Fingerprint className="mr-1.5 h-4 w-4" aria-hidden="true" />
              2FA code
            </TabsTrigger>
          </TabsList>

          <TabsContent value="password" className="space-y-2 pt-3">
            <Label htmlFor="step-up-password">Account password</Label>
            <div className="relative">
              <Input
                id="step-up-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !busy && submit()}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </TabsContent>

          <TabsContent value="totp" className="space-y-2 pt-3">
            <Label htmlFor="step-up-code">6-digit authenticator code</Label>
            <Input
              id="step-up-code"
              inputMode="numeric"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && !busy && submit()}
            />
            {!factorId ? (
              <p className="text-xs text-muted-foreground">
                No authenticator app is enrolled — use your password instead.
              </p>
            ) : null}
          </TabsContent>
        </Tabs>

        {error ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={busy || (tab === "password" ? !password : code.length !== 6)}
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Confirm &amp; continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
