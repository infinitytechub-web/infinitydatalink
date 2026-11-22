import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPermission } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit-log";
import { MEMBER_QUOTA_BYTES, validateUpload } from "@/lib/files.shared";

/**
 * Loan documents are member_files rows linked to a loan via `loan_id`.
 * Members upload against their own loans; officers review them from the
 * loan detail page. Preview/download reuse `signFileUrl`, review reuses
 * `adminReviewFile`.
 */

export type LoanDocument = {
  id: string;
  loan_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  review_status: "pending" | "approved" | "rejected";
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export type MyLoanOption = { id: string; ref: string; product: string; status: string };

const COLS =
  "id, loan_id, filename, mime_type, size_bytes, review_status, review_note, reviewed_at, created_at";

function map(r: any): LoanDocument {
  return {
    id: r.id,
    loan_id: r.loan_id,
    filename: r.filename,
    mime_type: r.mime_type,
    size_bytes: Number(r.size_bytes ?? 0),
    review_status: (r.review_status ?? "pending") as LoanDocument["review_status"],
    review_note: r.review_note ?? null,
    reviewed_at: r.reviewed_at ?? null,
    created_at: r.created_at,
  };
}

export const listMyLoanDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ loans: MyLoanOption[]; documents: LoanDocument[] }> => {
    const [loansRes, docsRes] = await Promise.all([
      context.supabase
        .from("loans")
        .select("id, ref, product, status")
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(100),
      context.supabase
        .from("member_files")
        .select(COLS)
        .eq("owner_id", context.userId)
        .not("loan_id", "is", null)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);
    if (loansRes.error) throw new Error(loansRes.error.message);
    if (docsRes.error) throw new Error(docsRes.error.message);
    return {
      loans: (loansRes.data ?? []).map((l: any) => ({
        id: l.id,
        ref: l.ref,
        product: l.product,
        status: l.status,
      })),
      documents: (docsRes.data ?? []).map(map),
    };
  });

const RegisterSchema = z.object({
  loan_id: z.string().uuid(),
  storage_path: z.string().min(3).max(400),
  filename: z.string().trim().min(3).max(200),
  mime_type: z.string().trim().min(3).max(160),
  size_bytes: z.number().int().positive(),
});

export const registerMyLoanDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RegisterSchema.parse(d))
  .handler(async ({ data, context }): Promise<LoanDocument> => {
    const verdict = validateUpload({
      filename: data.filename,
      mime: data.mime_type,
      size: data.size_bytes,
    });
    if (!verdict.ok) throw new Error(`Upload rejected: ${verdict.reasons.join(", ")}`);
    if (!data.storage_path.startsWith(`${context.userId}/`)) {
      throw new Error("Upload rejected: illegal_storage_path");
    }
    // The loan must belong to the caller.
    const { data: loan, error: lErr } = await context.supabase
      .from("loans")
      .select("id, ref, user_id")
      .eq("id", data.loan_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (lErr) throw new Error(lErr.message);
    if (!loan) throw new Error("Loan not found");

    const { data: existing, error: qErr } = await context.supabase
      .from("member_files")
      .select("size_bytes")
      .eq("owner_id", context.userId)
      .is("deleted_at", null);
    if (qErr) throw new Error(qErr.message);
    const used = (existing ?? []).reduce((s, r: any) => s + Number(r.size_bytes ?? 0), 0);
    if (used + data.size_bytes > MEMBER_QUOTA_BYTES) {
      throw new Error("Upload rejected: quota_exceeded");
    }

    const { data: row, error } = await context.supabase
      .from("member_files")
      .insert({
        owner_id: context.userId,
        uploaded_by: context.userId,
        storage_path: data.storage_path,
        filename: data.filename,
        mime_type: data.mime_type,
        size_bytes: data.size_bytes,
        category: "loan_support",
        shared_with_staff: true,
        loan_id: data.loan_id,
      } as never)
      .select(COLS)
      .single();
    if (error) throw new Error(error.message);

    await writeAudit({
      actor_id: context.userId,
      actor_role: "member",
      action: "loan.document_uploaded",
      target: (row as any).id,
      meta: { loan_id: data.loan_id, loan_ref: (loan as any).ref, filename: data.filename },
    });
    return map(row);
  });

export const adminListLoanDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ loan_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<LoanDocument[]> => {
    await assertPermission(context.supabase, context.userId, "files", "view");
    const { data: rows, error } = await context.supabase
      .from("member_files")
      .select(COLS)
      .eq("loan_id", data.loan_id)
      .eq("shared_with_staff", true)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []).map(map);
  });
