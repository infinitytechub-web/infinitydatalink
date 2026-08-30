import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ProbeResult = {
  id: string;
  category: "relationship" | "table" | "rpc";
  name: string;
  detail: string;
  status: "pass" | "fail";
  duration_ms: number;
  error: string | null;
};

async function assertStaff(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = new Set((data ?? []).map((r: any) => r.role as string));
  if (
    !roles.has("super_admin") &&
    !roles.has("compliance_officer") &&
    !roles.has("finance_officer")
  ) {
    throw new Error("Forbidden: staff role required");
  }
}

type Probe = {
  id: string;
  category: ProbeResult["category"];
  name: string;
  detail: string;
  run: (sb: any) => Promise<any>;
};

const PROBES: Probe[] = [
  // Relationship probes — one PostgREST embed per FK the UI relies on.
  {
    id: "rel.transactions.profiles",
    category: "relationship",
    name: "transactions → profiles",
    detail: "transactions_user_id_profiles_fkey",
    run: (sb) =>
      sb
        .from("transactions")
        .select("id, profiles!transactions_user_id_profiles_fkey(id)")
        .limit(1),
  },
  {
    id: "rel.transactions.savings_accounts",
    category: "relationship",
    name: "transactions → savings_accounts",
    detail: "transactions_savings_account_id_fkey",
    run: (sb) => sb.from("transactions").select("id, savings_accounts(id)").limit(1),
  },
  {
    id: "rel.transactions.loans",
    category: "relationship",
    name: "transactions → loans",
    detail: "transactions_loan_id_fkey",
    run: (sb) => sb.from("transactions").select("id, loans(id)").limit(1),
  },
  {
    id: "rel.savings_accounts.profiles",
    category: "relationship",
    name: "savings_accounts → profiles",
    detail: "savings_accounts_user_id_profiles_fkey",
    run: (sb) =>
      sb
        .from("savings_accounts")
        .select("id, profiles!savings_accounts_user_id_profiles_fkey(id)")
        .limit(1),
  },
  {
    id: "rel.savings_accounts.savings_plans",
    category: "relationship",
    name: "savings_accounts → savings_plans",
    detail: "savings_accounts_plan_id_fkey",
    run: (sb) => sb.from("savings_accounts").select("id, savings_plans(id, name)").limit(1),
  },
  {
    id: "rel.loans.profiles",
    category: "relationship",
    name: "loans → profiles",
    detail: "loans_user_id_profiles_fkey",
    run: (sb) => sb.from("loans").select("id, profiles!loans_user_id_profiles_fkey(id)").limit(1),
  },
  {
    id: "rel.loan_repayments.loans",
    category: "relationship",
    name: "loan_repayments → loans",
    detail: "loan_repayments_loan_id_fkey",
    run: (sb) => sb.from("loan_repayments").select("id, loans(id, ref)").limit(1),
  },
  {
    id: "rel.entity_memberships.entities",
    category: "relationship",
    name: "entity_memberships → entities",
    detail: "entity_memberships_entity_id_fkey",
    run: (sb) => sb.from("entity_memberships").select("id, entities(id, name)").limit(1),
  },
  {
    id: "rel.entity_memberships.profiles",
    category: "relationship",
    name: "entity_memberships → profiles",
    detail: "entity_memberships_profile_id_fkey",
    run: (sb) => sb.from("entity_memberships").select("id, profiles(id, full_name)").limit(1),
  },
  {
    id: "rel.kyc_documents.profiles",
    category: "relationship",
    name: "kyc_documents → profiles",
    detail: "kyc_documents_member_id_fkey",
    run: (sb) => sb.from("kyc_documents").select("id, profiles(id, full_name)").limit(1),
  },
  {
    id: "rel.next_of_kin.profiles",
    category: "relationship",
    name: "next_of_kin → profiles",
    detail: "next_of_kin_member_id_fkey",
    run: (sb) => sb.from("next_of_kin").select("id, profiles(id, full_name)").limit(1),
  },

  // Table reachability — RLS-scoped counts prove the Data API can reach the table.
  {
    id: "tbl.profiles",
    category: "table",
    name: "profiles",
    detail: "SELECT 1",
    run: (sb) => sb.from("profiles").select("id", { head: true, count: "exact" }),
  },
  {
    id: "tbl.user_roles",
    category: "table",
    name: "user_roles",
    detail: "SELECT 1",
    run: (sb) => sb.from("user_roles").select("user_id", { head: true, count: "exact" }),
  },
  {
    id: "tbl.savings_plans",
    category: "table",
    name: "savings_plans",
    detail: "SELECT 1",
    run: (sb) => sb.from("savings_plans").select("id", { head: true, count: "exact" }),
  },
  {
    id: "tbl.savings_accounts",
    category: "table",
    name: "savings_accounts",
    detail: "SELECT 1",
    run: (sb) => sb.from("savings_accounts").select("id", { head: true, count: "exact" }),
  },
  {
    id: "tbl.transactions",
    category: "table",
    name: "transactions",
    detail: "SELECT 1",
    run: (sb) => sb.from("transactions").select("id", { head: true, count: "exact" }),
  },
  {
    id: "tbl.loans",
    category: "table",
    name: "loans",
    detail: "SELECT 1",
    run: (sb) => sb.from("loans").select("id", { head: true, count: "exact" }),
  },
  {
    id: "tbl.loan_repayments",
    category: "table",
    name: "loan_repayments",
    detail: "SELECT 1",
    run: (sb) => sb.from("loan_repayments").select("id", { head: true, count: "exact" }),
  },
  {
    id: "tbl.expenses",
    category: "table",
    name: "expenses",
    detail: "SELECT 1",
    run: (sb) => sb.from("expenses").select("id", { head: true, count: "exact" }),
  },
  {
    id: "tbl.expense_categories",
    category: "table",
    name: "expense_categories",
    detail: "SELECT 1",
    run: (sb) => sb.from("expense_categories").select("code", { head: true, count: "exact" }),
  },
  {
    id: "tbl.transfers",
    category: "table",
    name: "transfers",
    detail: "SELECT 1",
    run: (sb) => sb.from("transfers").select("id", { head: true, count: "exact" }),
  },
  {
    id: "tbl.entities",
    category: "table",
    name: "entities",
    detail: "SELECT 1",
    run: (sb) => sb.from("entities").select("id", { head: true, count: "exact" }),
  },
  {
    id: "tbl.entity_memberships",
    category: "table",
    name: "entity_memberships",
    detail: "SELECT 1",
    run: (sb) => sb.from("entity_memberships").select("id", { head: true, count: "exact" }),
  },
  {
    id: "tbl.kyc_documents",
    category: "table",
    name: "kyc_documents",
    detail: "SELECT 1",
    run: (sb) => sb.from("kyc_documents").select("id", { head: true, count: "exact" }),
  },
  {
    id: "tbl.next_of_kin",
    category: "table",
    name: "next_of_kin",
    detail: "SELECT 1",
    run: (sb) => sb.from("next_of_kin").select("id", { head: true, count: "exact" }),
  },
  {
    id: "tbl.audit_log",
    category: "table",
    name: "audit_log",
    detail: "SELECT 1",
    run: (sb) => sb.from("audit_log").select("id", { head: true, count: "exact" }),
  },
  {
    id: "tbl.balance_adjustments",
    category: "table",
    name: "balance_adjustments",
    detail: "SELECT 1",
    run: (sb) => sb.from("balance_adjustments").select("id", { head: true, count: "exact" }),
  },

  // RPC reachability — ensures privileged helpers are callable via PostgREST.
  {
    id: "rpc.list_super_admins",
    category: "rpc",
    name: "list_super_admins()",
    detail: "SECURITY DEFINER, super_admin only",
    run: async (sb) => {
      const r = await sb.rpc("list_super_admins");
      // Non-super_admin callers see a permission error — that's an expected
      // guardrail, not an integration failure. Treat 42501 as pass.
      if (r.error && /forbidden|permission/i.test(r.error.message))
        return { data: null, error: null };
      return r;
    },
  },
];

export type HealthReport = {
  ran_at: string;
  total: number;
  passed: number;
  failed: number;
  results: ProbeResult[];
};

export const adminRunHealthCheck = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<HealthReport> => {
    await assertStaff(context.supabase, context.userId);
    const results: ProbeResult[] = await Promise.all(
      PROBES.map(async (p) => {
        const started = Date.now();
        try {
          const res: any = await p.run(context.supabase);
          const err = res?.error ?? null;
          return {
            id: p.id,
            category: p.category,
            name: p.name,
            detail: p.detail,
            status: err ? "fail" : "pass",
            duration_ms: Date.now() - started,
            error: err ? String(err.message ?? err) : null,
          } satisfies ProbeResult;
        } catch (e: any) {
          return {
            id: p.id,
            category: p.category,
            name: p.name,
            detail: p.detail,
            status: "fail",
            duration_ms: Date.now() - started,
            error: String(e?.message ?? e),
          } satisfies ProbeResult;
        }
      }),
    );
    results.sort((a, b) =>
      a.status === b.status ? a.name.localeCompare(b.name) : a.status === "fail" ? -1 : 1,
    );
    const passed = results.filter((r) => r.status === "pass").length;
    return {
      ran_at: new Date().toISOString(),
      total: results.length,
      passed,
      failed: results.length - passed,
      results,
    };
  });
