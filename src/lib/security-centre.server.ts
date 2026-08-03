/**
 * Server-only helpers for the Security Centre.
 *
 * Privacy model: session and event rows carry network identifiers (IP address,
 * user agent). Staff with `security.view` see *redacted* values — the last IP
 * octet / IPv6 suffix is dropped and the user agent is reduced to a device and
 * browser family. Only `security.manage` holders see the raw address, and every
 * unmasked read is written to the audit trail by the calling server function.
 */

export type SecuritySettings = {
  firewall_enabled: boolean;
  ip_allowlist_only: boolean;
  rate_limiting_enabled: boolean;
  upload_scanning_enabled: boolean;
  max_upload_mb: number;
  allowed_upload_mime: string[];
  block_executables: boolean;
  updated_at: string | null;
};

export type IpRule = {
  id: string;
  cidr: string;
  mode: "allow" | "deny";
  note: string | null;
  enabled: boolean;
  created_at: string;
};

export type RateLimit = {
  id: string;
  scope: string;
  window_seconds: number;
  max_requests: number;
  enabled: boolean;
  note: string | null;
};

export type SecurityEvent = {
  id: string;
  created_at: string;
  action: string;
  actor: string;
  actor_role: string | null;
  target: string | null;
  ip: string | null;
  severity: "info" | "warning" | "critical";
  meta: Record<string, unknown>;
};

export type UploadScan = {
  id: string;
  created_at: string;
  filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  verdict: "clean" | "blocked" | "quarantined" | string;
  reasons: string[];
  uploader: string;
};

export type LiveSession = {
  id: string;
  user_id: string;
  name: string;
  ip: string;
  device: string;
  browser: string;
  started_at: string;
  last_seen_at: string;
  active: boolean;
};

/** Drop the host portion of an address so staff cannot fingerprint an individual. */
export function maskIp(ip: string | null | undefined): string {
  if (!ip) return "—";
  const value = ip.trim();
  if (value.includes(":")) {
    const parts = value.split(":").filter(Boolean);
    return `${parts.slice(0, 3).join(":")}:••••`;
  }
  const octets = value.split(".");
  if (octets.length === 4) return `${octets.slice(0, 3).join(".")}.•••`;
  return "•••";
}

/** Reduce a user agent to a coarse device + browser family (no version strings). */
export function summariseAgent(agent: string | null | undefined): {
  device: string;
  browser: string;
} {
  const ua = (agent ?? "").toLowerCase();
  if (!ua) return { device: "Unknown", browser: "Unknown" };
  const device = /ipad|tablet/.test(ua)
    ? "Tablet"
    : /iphone|android|mobile/.test(ua)
      ? "Mobile"
      : "Desktop";
  const browser = /edg\//.test(ua)
    ? "Edge"
    : /opr\/|opera/.test(ua)
      ? "Opera"
      : /chrome|crios/.test(ua)
        ? "Chrome"
        : /firefox|fxios/.test(ua)
          ? "Firefox"
          : /safari/.test(ua)
            ? "Safari"
            : "Other";
  return { device, browser };
}

/** Audit actions surfaced in the Security Centre, grouped for the filter UI. */
export const EVENT_CATEGORIES = {
  all: [] as string[],
  auth: ["auth.", "login", "passkey", "stepup", "step_up"],
  access: ["role", "permission", "users."],
  security: ["security."],
  payments: ["payments."],
  documents: ["document."],
} as const;

export type EventCategory = keyof typeof EVENT_CATEGORIES;

const CRITICAL = /(blocked|denied|failed|revoke|forbidden|breach|malware|quarantine)/i;
const WARNING = /(reject|suspend|purge|delete|escalat|flag|limit)/i;

export function severityFor(action: string, meta: Record<string, unknown>): SecurityEvent["severity"] {
  const haystack = `${action} ${JSON.stringify(meta ?? {})}`;
  if (CRITICAL.test(haystack)) return "critical";
  if (WARNING.test(haystack)) return "warning";
  return "info";
}

/** Pull a network address out of an audit meta blob, whatever key it used. */
export function ipFromMeta(meta: Record<string, unknown>): string | null {
  for (const key of ["ip", "ip_address", "client_ip", "remote_addr"]) {
    const value = meta?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

type RpcClient = {
  rpc: (
    fn: "has_permission_for",
    args: { _module: string; _action: string },
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

/** Throws unless the caller holds `security.<action>` in the database matrix. */
export async function assertSecurityPermission(
  supabase: unknown,
  action: "view" | "manage",
): Promise<void> {
  const { data, error } = await (supabase as RpcClient).rpc("has_permission_for", {
    _module: "security",
    _action: action,
  });
  if (error) throw new Error(error.message);
  if (data !== true) throw new Error(`Forbidden: security.${action} permission required`);
}

export async function canManageSecurity(supabase: unknown): Promise<boolean> {
  const { data } = await (supabase as RpcClient).rpc("has_permission_for", {
    _module: "security",
    _action: "manage",
  });
  return data === true;
}
