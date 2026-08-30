/**
 * Shared file-management rules. Imported by both the browser upload UI and the
 * server functions so the client and the server enforce the same limits.
 */
export const FILE_BUCKET = "member-files";

export const MAX_FILE_BYTES = 15 * 1024 * 1024;

export const FILE_CATEGORIES = [
  "general",
  "identity",
  "proof_of_address",
  "income",
  "loan_support",
  "statement",
  "correspondence",
] as const;
export type FileCategory = (typeof FILE_CATEGORIES)[number];

export const FILE_CATEGORY_LABELS: Record<FileCategory, string> = {
  general: "General",
  identity: "Identity",
  proof_of_address: "Proof of address",
  income: "Income / payslip",
  loan_support: "Loan supporting document",
  statement: "Statement",
  correspondence: "Correspondence",
};

/** Allowed mime types mapped to their permitted extensions. */
export const ALLOWED_TYPES: Record<string, string[]> = {
  "application/pdf": ["pdf"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "text/csv": ["csv"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
};

export const ACCEPT_ATTRIBUTE = Object.entries(ALLOWED_TYPES)
  .flatMap(([mime, exts]) => [mime, ...exts.map((e) => `.${e}`)])
  .join(",");

export function extensionOf(filename: string): string {
  const parts = filename.toLowerCase().split(".");
  return parts.length > 1 ? (parts.pop() as string) : "";
}

export type FileValidation = { ok: true } | { ok: false; reasons: string[] };

/** Type + extension + size validation shared by client and server. */
export function validateUpload(input: {
  filename: string;
  mime: string;
  size: number;
}): FileValidation {
  const reasons: string[] = [];
  const allowed = ALLOWED_TYPES[input.mime];
  if (!allowed) reasons.push(`unsupported_type:${input.mime || "unknown"}`);
  else if (!allowed.includes(extensionOf(input.filename))) reasons.push("extension_mime_mismatch");
  if (!(input.size > 0)) reasons.push("empty_file");
  if (input.size > MAX_FILE_BYTES) reasons.push("file_too_large");
  if (input.filename.trim().length < 3) reasons.push("filename_too_short");
  if (/[\\/]|\.\./.test(input.filename)) reasons.push("illegal_filename");
  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}

export function humanBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isPreviewable(mime: string): boolean {
  return mime.startsWith("image/") || mime === "application/pdf";
}

/** Storage key: the first segment is the owner id, which storage RLS pins. */
export function buildStoragePath(ownerId: string, filename: string): string {
  const ext = extensionOf(filename);
  const safe = filename
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
  const unique = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `${ownerId}/${unique}-${safe || `upload.${ext || "bin"}`}`;
}

/** Per-member storage quota (soft cap enforced server-side on register). */
export const MEMBER_QUOTA_BYTES = 200 * 1024 * 1024;
