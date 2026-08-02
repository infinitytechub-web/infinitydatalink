/**
 * Risk patterns for KYC resubmissions.
 *
 * Pure, dependency-free rule evaluation so the same logic can run on the
 * server (to persist a flag + audit entry) and in the UI (to explain to the
 * reviewer why a resubmission was flagged for re-review).
 */

export type RiskSeverity = "low" | "medium" | "high";
export type RiskLevel = "none" | RiskSeverity;

export type RiskFlag = {
  /** Stable machine code, safe to store and report on. */
  code: string;
  severity: RiskSeverity;
  /** Reviewer-facing one-liner. */
  message: string;
  /** Remediation keys that triggered this pattern, when applicable. */
  items: string[];
};

export type RiskAssessment = {
  level: RiskLevel;
  flags: RiskFlag[];
  /** Short human summary, e.g. for the audit trail and notes. */
  summary: string | null;
};

const SEVERITY_ORDER: Record<RiskSeverity, number> = { low: 1, medium: 2, high: 3 };

export const RISK_SEVERITY_LABEL: Record<RiskSeverity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

/** Documents a compliance file is not complete without. */
export const CRITICAL_DOC_KEYS = [
  "document:national_id_front",
  "document:national_id_back",
  "document:selfie",
] as const;

/** Identity fields that must never be blank on an approved member. */
export const CRITICAL_PROFILE_KEYS = [
  "profile:full_name",
  "profile:date_of_birth",
  "profile:national_id",
  "profile:phone",
  "profile:region",
  "profile:address_line",
] as const;

export type RiskInputRow = {
  key: string;
  kind: "profile" | "document";
  label: string;
  requested: boolean;
  changed: boolean;
  before: string | null;
  after: string | null;
};

export type RiskInput = {
  rows: RiskInputRow[];
  /** Resubmission attempts consumed so far. */
  attempts_used: number;
  /** True when a rejection snapshot exists (otherwise the diff is unreliable). */
  has_snapshot: boolean;
};

/**
 * Evaluates every risk pattern against a resubmission diff. Rules are additive
 * and never throw: a resubmission with no snapshot simply yields fewer flags.
 */
export function assessResubmissionRisk(input: RiskInput): RiskAssessment {
  const flags: RiskFlag[] = [];
  const byKey = new Map(input.rows.map((r) => [r.key, r]));
  const isBlank = (v: string | null) => !v || String(v).trim() === "";

  // 1. Reviewer asked for a document, member re-submitted nothing new.
  const staleDocs = input.rows.filter(
    (r) => r.kind === "document" && r.requested && !r.changed,
  );
  if (staleDocs.length > 0) {
    flags.push({
      code: "unchanged_requested_documents",
      severity: "high",
      message: `Requested document${staleDocs.length > 1 ? "s" : ""} unchanged since rejection: ${staleDocs
        .map((r) => r.label)
        .join(", ")}.`,
      items: staleDocs.map((r) => r.key),
    });
  }

  // 2. Reviewer asked for a field change, value is byte-identical.
  const staleFields = input.rows.filter(
    (r) => r.kind === "profile" && r.requested && !r.changed,
  );
  if (staleFields.length > 0) {
    flags.push({
      code: "unchanged_requested_fields",
      severity: "medium",
      message: `Requested field${staleFields.length > 1 ? "s" : ""} unchanged: ${staleFields
        .map((r) => r.label)
        .join(", ")}.`,
      items: staleFields.map((r) => r.key),
    });
  }

  // 3. A document required for verification is missing altogether.
  const missingDocs = CRITICAL_DOC_KEYS.map((k) => byKey.get(k)).filter(
    (r): r is RiskInputRow => Boolean(r) && isBlank(r!.after),
  );
  if (missingDocs.length > 0) {
    flags.push({
      code: "missing_critical_documents",
      severity: "high",
      message: `Missing mandatory document${missingDocs.length > 1 ? "s" : ""}: ${missingDocs
        .map((r) => r.label)
        .join(", ")}.`,
      items: missingDocs.map((r) => r.key),
    });
  }

  // 4. A critical identity field is blank.
  const missingFields = CRITICAL_PROFILE_KEYS.map((k) => byKey.get(k)).filter(
    (r): r is RiskInputRow => Boolean(r) && isBlank(r!.after),
  );
  if (missingFields.length > 0) {
    flags.push({
      code: "missing_critical_fields",
      severity: "high",
      message: `Blank critical field${missingFields.length > 1 ? "s" : ""}: ${missingFields
        .map((r) => r.label)
        .join(", ")}.`,
      items: missingFields.map((r) => r.key),
    });
  }

  // 5. Identity anchor rewritten — legitimate but always worth a second look.
  const identityChanged = input.rows.filter(
    (r) =>
      r.changed &&
      (r.key === "profile:national_id" ||
        r.key === "profile:date_of_birth" ||
        r.key === "profile:full_name"),
  );
  if (identityChanged.length > 0) {
    flags.push({
      code: "identity_anchor_changed",
      severity: "medium",
      message: `Identity detail${identityChanged.length > 1 ? "s" : ""} changed after rejection: ${identityChanged
        .map((r) => r.label)
        .join(", ")}.`,
      items: identityChanged.map((r) => r.key),
    });
  }

  // 6. Nothing at all moved, yet the member resubmitted.
  if (input.has_snapshot && input.rows.every((r) => !r.changed)) {
    flags.push({
      code: "no_changes_at_all",
      severity: "high",
      message: "Resubmission is identical to the rejected submission — nothing changed.",
      items: [],
    });
  }

  // 7. Repeat offender: multiple attempts consumed already.
  if (input.attempts_used >= 3) {
    flags.push({
      code: "repeat_resubmission",
      severity: "low",
      message: `Member has used ${input.attempts_used} resubmission attempts.`,
      items: [],
    });
  }

  const level: RiskLevel = flags.reduce<RiskLevel>((acc, f) => {
    if (acc === "none") return f.severity;
    return SEVERITY_ORDER[f.severity] > SEVERITY_ORDER[acc as RiskSeverity] ? f.severity : acc;
  }, "none");

  return {
    level,
    flags,
    summary:
      flags.length === 0
        ? null
        : `${flags.length} risk pattern${flags.length > 1 ? "s" : ""} detected (${RISK_SEVERITY_LABEL[
            level as RiskSeverity
          ].toLowerCase()} risk): ${flags.map((f) => f.code).join(", ")}`,
  };
}

/** True when the assessment reaches the configured auto-flag threshold. */
export function meetsFlagThreshold(level: RiskLevel, minSeverity: RiskSeverity): boolean {
  if (level === "none") return false;
  return SEVERITY_ORDER[level] >= SEVERITY_ORDER[minSeverity];
}
