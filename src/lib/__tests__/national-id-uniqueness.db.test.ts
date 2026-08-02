import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { normalizeNationalId, nationalIdKey } from "@/lib/ghana-id-types";

/**
 * National ID uniqueness is enforced by the database, not by application reads:
 *  - expression unique indexes on the normalized (canonical) form of
 *    `profiles.ghana_card` and `profiles.national_id`
 *  - a `national_id_claims` registry with a primary key on the canonical key,
 *    so the same number can never be split across the two columns of two
 *    different members.
 *
 * Structural checks run whenever a sandbox database is present. The
 * race-condition end-to-end test creates real accounts, so it is opt-in via
 * RUN_ID_RACE_E2E=1.
 */

const hasDb = !!process.env.PGHOST;
const d = hasDb ? describe : describe.skip;

function q(sql: string): string {
  return execFileSync("psql", ["-tAX", "-c", sql], { encoding: "utf8" }).trim();
}

d("database-level national ID uniqueness", () => {
  it("has a unique index on the normalized ghana_card", () => {
    const def = q(
      `select indexdef from pg_indexes where schemaname='public' and indexname='profiles_ghana_card_key_uidx';`,
    );
    expect(def).toContain("CREATE UNIQUE INDEX");
    expect(def).toContain("national_id_key");
  });

  it("has a unique index on the normalized national_id", () => {
    const def = q(
      `select indexdef from pg_indexes where schemaname='public' and indexname='profiles_national_id_key_uidx';`,
    );
    expect(def).toContain("CREATE UNIQUE INDEX");
    expect(def).toContain("national_id_key");
  });

  it("keys the cross-column claims registry on the canonical id key", () => {
    const pk = q(
      `select pg_get_constraintdef(oid) from pg_constraint
        where conrelid='public.national_id_claims'::regclass and contype='p';`,
    );
    expect(pk).toBe("PRIMARY KEY (id_key)");

    const rls = q(
      `select relrowsecurity::text from pg_class where oid='public.national_id_claims'::regclass;`,
    );
    expect(rls).toBe("true");

    // Internal integrity table: no client role may read or write it.
    const grants = q(
      `select coalesce(string_agg(distinct grantee, ','), '') from information_schema.role_table_grants
        where table_schema='public' and table_name='national_id_claims'
          and grantee in ('anon','authenticated');`,
    );
    expect(grants).toBe("");
  });

  it("keeps the claims registry in step with profile writes via triggers", () => {
    const triggers = q(
      `select string_agg(tgname, ',' order by tgname) from pg_trigger
        where tgrelid='public.profiles'::regclass and not tgisinternal;`,
    );
    expect(triggers).toContain("profiles_sync_national_id_claims_trg");
    expect(triggers).toContain("profiles_release_national_id_claims_trg");
  });

  it("agrees with the UI canonical key for every ID type", () => {
    const cases: Array<[string, string]> = [
      ["ghana_card", "gha 123456789 1"],
      ["ghana_card", "GHA-123456789-1"],
      ["passport", "g-123 456 7"],
      ["ssnit", "c 012 345 678 9"],
      ["voter_id", "1234 5678 90"],
      ["nhis", "1234-5678-90"],
      ["tin", "p00 123 456 7"],
    ];
    for (const [type, raw] of cases) {
      const ui = nationalIdKey(type, normalizeNationalId(type, raw));
      const db = q(
        `select coalesce(public.national_id_key('${type}', ${literal(raw)}), '');`,
      );
      expect(db, `${type} / "${raw}"`).toBe(ui ?? "");
    }
  });

  it("has no duplicate canonical keys in existing data", () => {
    const dupes = q(
      `select count(*)::text from (
         select id_key from public.national_id_claims group by id_key having count(*) > 1
       ) s;`,
    );
    expect(dupes).toBe("0");
  });
});

function literal(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

/* ------------------------------------------------------------------ *
 * Race condition end-to-end test                                      *
 * ------------------------------------------------------------------ */

const raceEnabled = process.env.RUN_ID_RACE_E2E === "1";
const r = raceEnabled ? describe : describe.skip;

function env(): { url: string; key: string } {
  let url = process.env.VITE_SUPABASE_URL ?? "";
  let key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
  if (!url || !key) {
    const raw = readFileSync(".env", "utf8");
    for (const line of raw.split("\n")) {
      const [k, ...rest] = line.split("=");
      const v = rest.join("=").trim();
      if (k === "VITE_SUPABASE_URL" && !url) url = v;
      if (k === "VITE_SUPABASE_PUBLISHABLE_KEY" && !key) key = v;
    }
  }
  return { url: url.replace(/\/$/, ""), key };
}

r("concurrent registrations with the same national ID", () => {
  it("admits exactly one member when two signups race on one Ghana Card", async () => {
    const { url, key } = env();
    expect(url && key, "Supabase URL/key required").toBeTruthy();

    const digits = String(Math.floor(100000000 + Math.random() * 899999999));
    // Two spellings of the SAME card, so only normalization + the unique index
    // can catch the collision.
    const cards = [`GHA-${digits}-7`, `gha ${digits} 7`];
    const stamp = Date.now();

    const signUp = (i: number) =>
      fetch(`${url}/auth/v1/signup`, {
        method: "POST",
        headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          email: `e2e.race.${stamp}.${i}@example.test`,
          password: `Race-${stamp}-${i}!`,
          data: {
            full_name: `Race Test ${i}`,
            phone: `02${String(stamp).slice(-8)}`,
            ghana_card: cards[i],
            date_of_birth: "1990-06-15",
            region: "Greater Accra",
            district: "Accra Metropolitan",
          },
        }),
      }).then(async (res) => ({ status: res.status, body: await res.text() }));

    // Fired together: both trigger handle_new_user -> profiles insert.
    const results = await Promise.all([signUp(0), signUp(1)]);

    const ok = results.filter((x) => x.status >= 200 && x.status < 300);
    const failed = results.filter((x) => x.status >= 400);

    expect(ok.length, JSON.stringify(results)).toBe(1);
    expect(failed.length).toBe(1);

    // And the database holds exactly one profile for that canonical key.
    const canonical = nationalIdKey("ghana_card", cards[0])!;
    const profiles = q(
      `select count(*)::text from public.profiles
        where public.national_id_key('ghana_card', ghana_card) = ${literal(canonical)};`,
    );
    expect(profiles).toBe("1");

    const claims = q(
      `select count(*)::text from public.national_id_claims where id_key = ${literal(canonical)};`,
    );
    expect(claims).toBe("1");
  }, 60_000);
});
