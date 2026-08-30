import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Fingerprint, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { SectionCard } from "@/components/primitives";
import {
  deleteMyPasskey,
  getPasskeyRegistrationOptions,
  listMyPasskeys,
  verifyPasskeyRegistration,
  type PasskeyRow,
} from "@/lib/passkeys.functions";

export function PasskeyEnrollmentCard() {
  const qc = useQueryClient();
  const list = useServerFn(listMyPasskeys);
  const getOptions = useServerFn(getPasskeyRegistrationOptions);
  const verify = useServerFn(verifyPasskeyRegistration);
  const del = useServerFn(deleteMyPasskey);

  const [supported, setSupported] = useState<boolean | null>(null);
  const [deviceLabel, setDeviceLabel] = useState("");

  useEffect(() => {
    const check = async () => {
      if (typeof window === "undefined" || !window.PublicKeyCredential) {
        setSupported(false);
        return;
      }
      try {
        const platform = await (
          window.PublicKeyCredential as unknown as {
            isUserVerifyingPlatformAuthenticatorAvailable?: () => Promise<boolean>;
          }
        ).isUserVerifyingPlatformAuthenticatorAvailable?.();
        setSupported(!!platform);
      } catch {
        setSupported(false);
      }
    };
    void check();
  }, []);

  const passkeys = useQuery({
    queryKey: ["passkeys"],
    queryFn: () => list(),
    staleTime: 30_000,
  });

  const enroll = useMutation({
    mutationFn: async () => {
      const { startRegistration } = await import("@simplewebauthn/browser");
      const options = await getOptions();
      const attestation = await startRegistration({ optionsJSON: options as never });
      await verify({
        data: {
          response: attestation,
          deviceLabel: deviceLabel.trim() || undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success("Passkey registered — you can now use it to sign in");
      setDeviceLabel("");
      void qc.invalidateQueries({ queryKey: ["passkeys"] });
    },
    onError: (e: unknown) => {
      const err = e as { name?: string; message?: string };
      if (err.name === "NotAllowedError" || err.name === "AbortError") {
        toast.error("Passkey enrollment cancelled");
      } else if (err.name === "InvalidStateError") {
        toast.error("A passkey is already registered on this device");
      } else {
        toast.error(err.message ?? "Passkey enrollment failed");
      }
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Passkey removed");
      void qc.invalidateQueries({ queryKey: ["passkeys"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <SectionCard title="Biometric passkeys">
      <p className="mb-3 text-xs text-muted-foreground">
        Register Face ID, fingerprint, Windows Hello, or a hardware key so you can sign in without
        typing your password.
      </p>
      {supported === false ? (
        <p className="rounded border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700">
          This browser or device doesn't support platform biometrics. Try Chrome, Safari, or Edge on
          a device with Face ID, Touch ID, or Windows Hello.
        </p>
      ) : null}

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex-1 text-xs">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Device label (optional)
          </span>
          <input
            type="text"
            value={deviceLabel}
            onChange={(e) => setDeviceLabel(e.target.value)}
            placeholder="e.g. iPhone 15, Work laptop"
            className="w-full rounded border border-emerald-deep/15 bg-background px-3 py-2 text-sm outline-none focus:border-teal-500"
          />
        </label>
        <button
          type="button"
          onClick={() => enroll.mutate()}
          disabled={enroll.isPending || supported === false || supported === null}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-white shadow-sm transition-colors hover:bg-teal-700 disabled:opacity-60"
        >
          {enroll.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Fingerprint className="size-4" />
          )}
          {enroll.isPending ? "Follow your device prompt…" : "Register this device"}
        </button>
      </div>

      <div className="mt-5">
        <h4 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          Registered passkeys
        </h4>
        <div className="mt-2 space-y-2">
          {passkeys.isLoading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : (passkeys.data ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No passkeys registered yet. Once you register one, you can use the biometric button on
              the sign-in screen.
            </p>
          ) : (
            (passkeys.data as PasskeyRow[]).map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded border border-emerald-deep/10 bg-background px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-3">
                  <ShieldCheck className="size-4 text-primary" />
                  <div>
                    <p className="font-medium text-emerald-deep">
                      {p.device_label ?? "Unnamed passkey"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Added {new Date(p.created_at).toLocaleDateString()}
                      {p.backed_up ? " · Synced" : " · Device-bound"}
                      {p.last_used_at
                        ? ` · Last used ${new Date(p.last_used_at).toLocaleDateString()}`
                        : ""}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (
                      confirm("Remove this passkey? You won't be able to sign in with it anymore.")
                    ) {
                      remove.mutate(p.id);
                    }
                  }}
                  className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label="Remove passkey"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </SectionCard>
  );
}
