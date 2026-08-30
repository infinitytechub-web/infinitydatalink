/**
 * End-to-end coverage for the member↔member and account↔account transfer
 * lifecycle. Runs directly against the Supabase Data API / SECURITY DEFINER
 * RPCs so it verifies the DB-side authorization (`request_transfer`,
 * `clear_transfer`, `reject_transfer`) independent of the UI wrapper.
 *
 * Env (see e2e/README.md):
 *   E2E_MEMBER_EMAIL / E2E_MEMBER_PASSWORD                 member A (source)
 *   E2E_MEMBER2_EMAIL / E2E_MEMBER2_PASSWORD               optional member B
 *     If provided, an additional member↔member request is issued from A→B.
 *     Otherwise only an account↔account (self→self) request is exercised
 *     when member A owns two active accounts.
 *   E2E_FINANCE_EMAIL / E2E_FINANCE_PASSWORD               finance_officer
 *     or super_admin. Required for the clear/reject transitions; otherwise
 *     those tests are skipped.
 */

import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "https://xypqvwkfldpjgejhgrjo.supabase.co";
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";

const MEMBER_EMAIL = process.env.E2E_MEMBER_EMAIL;
const MEMBER_PASSWORD = process.env.E2E_MEMBER_PASSWORD;
const MEMBER2_EMAIL = process.env.E2E_MEMBER2_EMAIL;
const MEMBER2_PASSWORD = process.env.E2E_MEMBER2_PASSWORD;
const FINANCE_EMAIL = process.env.E2E_FINANCE_EMAIL;
const FINANCE_PASSWORD = process.env.E2E_FINANCE_PASSWORD;

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

function makeClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      storageKey: `e2e-transfers-${Math.random()}`,
    },
  });
}

async function signIn(email: string, password: string): Promise<SupabaseClient> {
  const c = makeClient();
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (!data.session) throw new Error("no session");
  return c;
}

async function activeAccounts(
  c: SupabaseClient,
): Promise<Array<{ id: string; balance: number; user_id: string }>> {
  const { data } = await c
    .from("savings_accounts")
    .select("id, balance, user_id")
    .eq("status", "active")
    .order("created_at");
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id as string,
    balance: Number(r.balance),
    user_id: r.user_id as string,
  }));
}

test.describe("Anonymous callers cannot touch the transfer RPCs", () => {
  test.skip(!SUPABASE_ANON_KEY, "publishable key missing");
  const anon = makeClient();

  test("request_transfer rejects anon", async () => {
    const { error } = await anon.rpc("request_transfer", {
      _from_account_id: ZERO_UUID,
      _to_account_id: ZERO_UUID,
      _amount: 1,
      _note: null,
    });
    expect(error).not.toBeNull();
  });

  test("clear_transfer rejects anon", async () => {
    const { error } = await anon.rpc("clear_transfer", {
      _transfer_id: ZERO_UUID,
      _actor_id: ZERO_UUID,
    });
    expect(error).not.toBeNull();
  });

  test("reject_transfer rejects anon", async () => {
    const { error } = await anon.rpc("reject_transfer", {
      _transfer_id: ZERO_UUID,
      _reason: "anon",
      _actor_id: ZERO_UUID,
    });
    expect(error).not.toBeNull();
  });

  test("anon cannot read the transfers ledger", async () => {
    const { data } = await anon.from("transfers").select("id").limit(1);
    expect(data ?? []).toEqual([]);
  });
});

test.describe("Member requesting a transfer", () => {
  test.skip(!MEMBER_EMAIL || !MEMBER_PASSWORD, "member creds not provided");

  let member!: SupabaseClient;
  let myAccounts: Array<{ id: string; balance: number; user_id: string }> = [];

  test.beforeAll(async () => {
    member = await signIn(MEMBER_EMAIL!, MEMBER_PASSWORD!);
    myAccounts = await activeAccounts(member);
  });

  test("input validation: same account is rejected", async () => {
    test.skip(myAccounts.length < 1, "member has no active savings account");
    const acct = myAccounts[0]!;
    const { error } = await member.rpc("request_transfer", {
      _from_account_id: acct.id,
      _to_account_id: acct.id,
      _amount: 1,
      _note: "same-account",
    });
    expect(error?.message ?? "").toMatch(/same_account/i);
  });

  test("input validation: invalid amount is rejected", async () => {
    test.skip(myAccounts.length < 1, "member has no active savings account");
    const acct = myAccounts[0]!;
    const { error } = await member.rpc("request_transfer", {
      _from_account_id: acct.id,
      _to_account_id: ZERO_UUID,
      _amount: 0,
      _note: null,
    });
    expect(error?.message ?? "").toMatch(/invalid_amount/i);
  });

  test("source account must be owned by the caller", async () => {
    // Pick any account NOT owned by the member as source.
    const { data: others } = await member
      .from("savings_accounts")
      .select("id, user_id")
      .eq("status", "active")
      .neq("user_id", (await member.auth.getUser()).data.user?.id ?? ZERO_UUID)
      .limit(1);
    const foreign = (others ?? [])[0] as { id: string } | undefined;
    test.skip(
      !foreign || myAccounts.length < 1,
      "no foreign account available to attempt spoofed source",
    );
    const dest = myAccounts[0]!;
    const { error } = await member.rpc("request_transfer", {
      _from_account_id: foreign!.id,
      _to_account_id: dest.id,
      _amount: 1,
      _note: "spoofed-source",
    });
    expect(error?.message ?? "").toMatch(/source_not_owned/i);
  });

  test("member cannot invoke finance-only clear/reject", async () => {
    const guards = await Promise.all([
      member.rpc("clear_transfer", { _transfer_id: ZERO_UUID, _actor_id: ZERO_UUID }),
      member.rpc("reject_transfer", {
        _transfer_id: ZERO_UUID,
        _reason: "nope",
        _actor_id: ZERO_UUID,
      }),
    ]);
    for (const g of guards) expect(g.error).not.toBeNull();
  });
});

test.describe("Lifecycle: pending → cleared", () => {
  test.skip(!MEMBER_EMAIL || !MEMBER_PASSWORD, "member creds not provided");
  test.skip(!FINANCE_EMAIL || !FINANCE_PASSWORD, "finance creds not provided");

  test("account↔account (self-owned) transfer settles and moves balances", async () => {
    const member = await signIn(MEMBER_EMAIL!, MEMBER_PASSWORD!);
    const my = await activeAccounts(member);
    const withBalance = my.find((a) => a.balance >= 1);
    const other = my.find((a) => withBalance && a.id !== withBalance.id);
    test.skip(!withBalance || !other, "member needs two active accounts with the source funded");

    const amount = 1;
    const { data: reqRow, error: reqErr } = await member.rpc("request_transfer", {
      _from_account_id: withBalance!.id,
      _to_account_id: other!.id,
      _amount: amount,
      _note: "a2a lifecycle",
    });
    expect(reqErr).toBeNull();
    const transferId = (reqRow as any)?.id as string;
    expect(transferId).toBeTruthy();

    // Status is pending before finance acts.
    const before = await member.from("transfers").select("status").eq("id", transferId).single();
    expect(before.data?.status).toBe("pending");

    const finance = await signIn(FINANCE_EMAIL!, FINANCE_PASSWORD!);
    const financeId = (await finance.auth.getUser()).data.user!.id;

    const { error: clearErr } = await finance.rpc("clear_transfer", {
      _transfer_id: transferId,
      _actor_id: financeId,
    });
    expect(clearErr).toBeNull();

    const after = await member
      .from("transfers")
      .select("status, cleared_at, out_txn_id, in_txn_id")
      .eq("id", transferId)
      .single();
    expect(after.data?.status).toBe("cleared");
    expect(after.data?.cleared_at).not.toBeNull();
    expect(after.data?.out_txn_id).not.toBeNull();
    expect(after.data?.in_txn_id).not.toBeNull();

    // Balances actually moved: source down, destination up by `amount`.
    const post = await activeAccounts(member);
    const src2 = post.find((a) => a.id === withBalance!.id)!;
    const dst2 = post.find((a) => a.id === other!.id)!;
    expect(src2.balance).toBeCloseTo(withBalance!.balance - amount, 2);
    expect(dst2.balance).toBeCloseTo(other!.balance + amount, 2);

    // A pending transfer that is already cleared cannot be cleared again.
    const twice = await finance.rpc("clear_transfer", {
      _transfer_id: transferId,
      _actor_id: financeId,
    });
    expect(twice.error?.message ?? "").toMatch(/transfer_not_pending/i);
  });

  test("member↔member request settles to the other member's account", async () => {
    test.skip(!MEMBER2_EMAIL || !MEMBER2_PASSWORD, "member B creds not provided");
    const member = await signIn(MEMBER_EMAIL!, MEMBER_PASSWORD!);
    const member2 = await signIn(MEMBER2_EMAIL!, MEMBER2_PASSWORD!);

    const mine = await activeAccounts(member);
    const theirs = await activeAccounts(member2);
    const src = mine.find((a) => a.balance >= 1);
    const dst = theirs[0];
    test.skip(!src || !dst, "either source (funded) or destination account missing");

    const amount = 1;
    const { data: row, error } = await member.rpc("request_transfer", {
      _from_account_id: src!.id,
      _to_account_id: dst!.id,
      _amount: amount,
      _note: "m2m lifecycle",
    });
    expect(error).toBeNull();
    const id = (row as any)?.id as string;

    const finance = await signIn(FINANCE_EMAIL!, FINANCE_PASSWORD!);
    const financeId = (await finance.auth.getUser()).data.user!.id;
    const { error: clearErr } = await finance.rpc("clear_transfer", {
      _transfer_id: id,
      _actor_id: financeId,
    });
    expect(clearErr).toBeNull();

    // Recipient sees the incoming transfer under their own client via RLS.
    const inbound = await member2.from("transfers").select("id, status").eq("id", id).single();
    expect(inbound.data?.status).toBe("cleared");
  });
});

test.describe("Lifecycle: pending → failed (rejected)", () => {
  test.skip(!MEMBER_EMAIL || !MEMBER_PASSWORD, "member creds not provided");
  test.skip(!FINANCE_EMAIL || !FINANCE_PASSWORD, "finance creds not provided");

  test("rejecting a pending transfer leaves balances untouched and records the reason", async () => {
    const member = await signIn(MEMBER_EMAIL!, MEMBER_PASSWORD!);
    const my = await activeAccounts(member);
    const src = my.find((a) => a.balance >= 1);
    const dst = my.find((a) => src && a.id !== src.id);
    test.skip(!src || !dst, "member needs two active accounts with the source funded");

    const startSrc = src!.balance;
    const startDst = dst!.balance;

    const { data: row, error } = await member.rpc("request_transfer", {
      _from_account_id: src!.id,
      _to_account_id: dst!.id,
      _amount: 1,
      _note: "reject lifecycle",
    });
    expect(error).toBeNull();
    const id = (row as any)?.id as string;

    const finance = await signIn(FINANCE_EMAIL!, FINANCE_PASSWORD!);
    const financeId = (await finance.auth.getUser()).data.user!.id;
    const reason = `e2e-reject-${Date.now()}`;
    const { error: rejErr } = await finance.rpc("reject_transfer", {
      _transfer_id: id,
      _reason: reason,
      _actor_id: financeId,
    });
    expect(rejErr).toBeNull();

    const after = await member
      .from("transfers")
      .select("status, note, cleared_at")
      .eq("id", id)
      .single();
    expect(after.data?.status).toBe("failed");
    expect(after.data?.note ?? "").toContain(reason);
    expect(after.data?.cleared_at).not.toBeNull();

    // Balances untouched by a rejection.
    const post = await activeAccounts(member);
    const src2 = post.find((a) => a.id === src!.id)!;
    const dst2 = post.find((a) => a.id === dst!.id)!;
    expect(src2.balance).toBeCloseTo(startSrc, 2);
    expect(dst2.balance).toBeCloseTo(startDst, 2);

    // Already-terminal transfer cannot be rejected again nor cleared.
    const rejAgain = await finance.rpc("reject_transfer", {
      _transfer_id: id,
      _reason: "again",
      _actor_id: financeId,
    });
    expect(rejAgain.error?.message ?? "").toMatch(/transfer_not_pending/i);
    const clearTerminal = await finance.rpc("clear_transfer", {
      _transfer_id: id,
      _actor_id: financeId,
    });
    expect(clearTerminal.error?.message ?? "").toMatch(/transfer_not_pending/i);
  });
});
