import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PageInput = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(5).max(100).default(10),
  sortBy: z.string().default("created_at"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});
export type PageInput = z.infer<typeof PageInput>;
export type Paginated<T> = { rows: T[]; total: number; page: number; pageSize: number };

export type SavingsRow = {
  id: string;
  name: string;
  schedule: string;
  interest_rate: number;
  balance: number;
};

export type LoanRow = {
  id: string;
  ref: string;
  product: string;
  amount: number;
  term_months: number;
  interest_rate: number;
  status: "pending" | "approved" | "rejected" | "active" | "closed";
  purpose: string | null;
  created_at: string;
  decided_at: string | null;
};

export type TxnRow = {
  id: string;
  ref: string;
  kind: string;
  amount: number;
  channel: string | null;
  note: string | null;
  status: "pending" | "cleared" | "failed";
  created_at: string;
};

export type MemberSummary = {
  totalSavings: number;
  activeLoanBalance: number;
  nextContribution: number | null;
};

export const getMySavings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SavingsRow[]> => {
    const { data, error } = await context.supabase
      .from("savings_accounts")
      .select("id, balance, savings_plans(id, name, schedule, interest_rate)")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row: any) => ({
      id: row.id,
      balance: Number(row.balance ?? 0),
      name: row.savings_plans?.name ?? "Savings Plan",
      schedule: row.savings_plans?.schedule ?? "—",
      interest_rate: Number(row.savings_plans?.interest_rate ?? 0),
    }));
  });

export const getMyLoans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LoanRow[]> => {
    const { data, error } = await context.supabase
      .from("loans")
      .select("id, ref, product, amount, term_months, interest_rate, status, purpose, created_at, decided_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      ...r,
      amount: Number(r.amount),
      interest_rate: Number(r.interest_rate),
    })) as LoanRow[];
  });

export const getMyTransactions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TxnRow[]> => {
    const { data, error } = await context.supabase
      .from("transactions")
      .select("id, ref, kind, amount, channel, note, status, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({ ...r, amount: Number(r.amount) })) as TxnRow[];
  });

export const getMySummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MemberSummary> => {
    const [{ data: savings }, { data: loans }] = await Promise.all([
      context.supabase.from("savings_accounts").select("balance").eq("user_id", context.userId),
      context.supabase.from("loans").select("amount, status").eq("user_id", context.userId),
    ]);
    const totalSavings = (savings ?? []).reduce((s, r: any) => s + Number(r.balance ?? 0), 0);
    const activeLoanBalance = (loans ?? [])
      .filter((l: any) => l.status === "active" || l.status === "approved")
      .reduce((s, r: any) => s + Number(r.amount ?? 0), 0);
    return { totalSavings, activeLoanBalance, nextContribution: null };
  });

const LoanApplicationSchema = z.object({
  product: z.string().min(2).max(80),
  amount: z.number().positive().max(10_000_000),
  term_months: z.number().int().min(1).max(360),
  purpose: z.string().max(1000).optional().nullable(),
});

export const applyForLoan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => LoanApplicationSchema.parse(data))
  .handler(async ({ data, context }): Promise<LoanRow> => {
    const year = new Date().getFullYear();
    const suffix = Math.floor(1000 + Math.random() * 9000);
    const ref = `LN-${year}-${suffix}`;

    const { data: inserted, error } = await context.supabase
      .from("loans")
      .insert({
        user_id: context.userId,
        ref,
        product: data.product,
        amount: data.amount,
        term_months: data.term_months,
        purpose: data.purpose ?? null,
        status: "pending",
      })
      .select("id, ref, product, amount, term_months, interest_rate, status, purpose, created_at, decided_at")
      .single();
    if (error) throw new Error(error.message);

    await context.supabase.from("audit_log").insert({
      actor_id: context.userId,
      actor_email: (context.claims as any)?.email ?? null,
      actor_role: "member",
      action: "loan.application.submitted",
      target: inserted.id,
      meta: { ref, product: data.product, amount: data.amount, term_months: data.term_months },
    });

    return { ...inserted, amount: Number(inserted.amount), interest_rate: Number(inserted.interest_rate) } as LoanRow;
  });
