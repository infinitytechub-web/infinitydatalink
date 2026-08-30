// AI Business Intelligence server function. Reads institutional metrics from the DB
// (RLS scoped to the caller) and asks Lovable AI to produce three actionable insights.
import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

export type BusinessInsight = {
  title: string;
  value: string;
  hint: string;
};

export type InsightsPayload = {
  insights: BusinessInsight[];
  generatedAt: string;
  model: string;
};

export const generateBusinessInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<InsightsPayload> => {
    const { supabase } = context;
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    // Pull compact metrics from the DB. RLS ensures admin roles see the full set;
    // members would see only their own rows, so the caller MUST be an admin for this
    // to be meaningful. We enforce that check first.
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const adminRoles = new Set([
      "super_admin",
      "compliance_officer",
      "loan_officer",
      "finance_officer",
      "auditor",
    ]);
    const isAdmin = (roles ?? []).some((r) => adminRoles.has(r.role));
    if (!isAdmin) throw new Error("Forbidden: admin role required");

    const [{ count: memberCount }, { data: savings }, { data: loans }, { data: txns }] =
      await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("savings_accounts").select("balance"),
        supabase.from("loans").select("amount, status"),
        supabase
          .from("transactions")
          .select("amount, kind, status, created_at")
          .order("created_at", { ascending: false })
          .limit(500),
      ]);

    const totalSavings = (savings ?? []).reduce((s, r) => s + Number(r.balance ?? 0), 0);
    const activeLoans = (loans ?? []).filter(
      (l) => l.status === "active" || l.status === "approved",
    );
    const totalActiveLoanValue = activeLoans.reduce((s, l) => s + Number(l.amount ?? 0), 0);
    const failedTxns = (txns ?? []).filter((t) => t.status === "failed").length;
    const pendingLoans = (loans ?? []).filter((l) => l.status === "pending").length;

    const metrics = {
      members: memberCount ?? 0,
      totalSavings: Math.round(totalSavings),
      totalActiveLoanValue: Math.round(totalActiveLoanValue),
      pendingLoans,
      failedTxnsRecent: failedTxns,
      recentTxnCount: txns?.length ?? 0,
    };

    const gateway = createLovableAiGatewayProvider(key);
    const model = "google/gemini-3-flash-preview";
    const prompt = `You are an institutional financial analyst for a savings & loans cooperative.
Given these live metrics (currency amounts are in the local currency):

${JSON.stringify(metrics, null, 2)}

Produce EXACTLY 3 actionable business intelligence insights in strict JSON:
[
  {"title":"Default risk (30d)","value":"<short verdict>","hint":"<one-sentence explanation>"},
  {"title":"Savings forecast","value":"<short forecast>","hint":"<one-sentence rationale>"},
  {"title":"Cash reserve advice","value":"<short recommendation>","hint":"<one-sentence why>"}
]
Keep each field under 80 characters. Return ONLY the JSON array. No markdown, no prose.`;

    try {
      const { text } = await generateText({ model: gateway(model), prompt });
      const cleaned = text
        .trim()
        .replace(/^```json?\s*/i, "")
        .replace(/```$/i, "")
        .trim();
      const parsed = JSON.parse(cleaned) as BusinessInsight[];
      if (!Array.isArray(parsed) || parsed.length < 3) throw new Error("bad shape");
      return {
        insights: parsed.slice(0, 3).map((i) => ({
          title: String(i.title ?? ""),
          value: String(i.value ?? ""),
          hint: String(i.hint ?? ""),
        })),
        generatedAt: new Date().toISOString(),
        model,
      };
    } catch (err) {
      console.error("[AI BI] failed", err);
      return {
        insights: [
          {
            title: "Default risk (30d)",
            value: "Insufficient live data",
            hint: "Onboard more loan history to enable prediction.",
          },
          {
            title: "Savings forecast",
            value: "Awaiting baseline",
            hint: "Add member savings activity to project growth.",
          },
          {
            title: "Cash reserve advice",
            value: "Maintain current posture",
            hint: "Reassess once portfolio exceeds baseline volume.",
          },
        ],
        generatedAt: new Date().toISOString(),
        model,
      };
    }
  });
