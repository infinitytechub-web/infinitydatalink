/**
 * In-memory stand-in for the service-role Supabase client, good enough to run
 * the payment pipeline (intents → webhooks → receipts) end to end inside
 * vitest without a live database.
 *
 * Supports only the query shapes `payments.server.ts` and
 * `payment-webhooks.server.ts` actually use.
 */

type Row = Record<string, any>;

export type FakeDbOptions = {
  /** Table → columns that must stay unique (violations return code 23505). */
  unique?: Record<string, string[]>;
};

let idCounter = 0;
function newId(): string {
  idCounter += 1;
  return `00000000-0000-4000-8000-${String(idCounter).padStart(12, "0")}`;
}

type Filter = { kind: "eq" | "in" | "gte" | "lte"; col: string; value: any };

export class FakeSupabaseAdmin {
  tables: Record<string, Row[]> = {};
  private unique: Record<string, string[]>;
  private receiptSeq = 0;

  constructor(opts: FakeDbOptions = {}) {
    this.unique = opts.unique ?? {};
  }

  seed(table: string, rows: Row[]) {
    this.tables[table] = (this.tables[table] ?? []).concat(
      rows.map((r) => ({ id: r["id"] ?? newId(), created_at: new Date().toISOString(), ...r })),
    );
  }

  rows(table: string): Row[] {
    return this.tables[table] ?? [];
  }

  from(table: string) {
    return new FakeQuery(this, table);
  }

  async rpc(name: string) {
    if (name === "next_payment_receipt_no") {
      this.receiptSeq += 1;
      return { data: `RCPT-${String(this.receiptSeq).padStart(6, "0")}`, error: null };
    }
    return { data: null, error: { message: `unknown rpc ${name}` } };
  }

  /** @internal */
  insertRows(table: string, payload: Row | Row[]) {
    const list = Array.isArray(payload) ? payload : [payload];
    const existing = (this.tables[table] ??= []);
    const uniqueCols = this.unique[table] ?? [];
    const inserted: Row[] = [];
    for (const p of list) {
      for (const col of uniqueCols) {
        const v = p[col];
        if (v != null && existing.some((r) => r[col] === v)) {
          return {
            rows: null,
            error: { code: "23505", message: `duplicate key value for ${col}` },
          };
        }
      }
      const now = new Date().toISOString();
      const row: Row = { id: newId(), created_at: now, updated_at: now, ...p };
      existing.push(row);
      inserted.push(row);
    }
    return { rows: inserted, error: null };
  }
}

class FakeQuery implements PromiseLike<{ data: any; count: number | null; error: any }> {
  private filters: Filter[] = [];
  private mode: "select" | "insert" | "update" = "select";
  private pending: Row[] | null = null;
  private patch: Row | null = null;
  private wantCount = false;
  private rangeArgs: [number, number] | null = null;
  private orderCol: { col: string; asc: boolean } | null = null;

  constructor(
    private db: FakeSupabaseAdmin,
    private table: string,
  ) {}

  select(_cols?: string, opts?: { count?: string }) {
    if (opts?.count) this.wantCount = true;
    return this;
  }
  insert(payload: Row | Row[]) {
    this.mode = "insert";
    this.pending = Array.isArray(payload) ? payload : [payload];
    return this;
  }
  update(patch: Row) {
    this.mode = "update";
    this.patch = patch;
    return this;
  }
  eq(col: string, value: any) {
    this.filters.push({ kind: "eq", col, value });
    return this;
  }
  in(col: string, value: any[]) {
    this.filters.push({ kind: "in", col, value });
    return this;
  }
  gte(col: string, value: any) {
    this.filters.push({ kind: "gte", col, value });
    return this;
  }
  lte(col: string, value: any) {
    this.filters.push({ kind: "lte", col, value });
    return this;
  }
  or(_expr: string) {
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderCol = { col, asc: opts?.ascending !== false };
    return this;
  }
  range(from: number, to: number) {
    this.rangeArgs = [from, to];
    return this;
  }

  private matching(): Row[] {
    return this.db.rows(this.table).filter((row) =>
      this.filters.every((f) => {
        const v = row[f.col];
        if (f.kind === "eq") return v === f.value;
        if (f.kind === "in") return (f.value as any[]).includes(v);
        if (f.kind === "gte") return String(v) >= String(f.value);
        return String(v) <= String(f.value);
      }),
    );
  }

  private run(): { data: any; count: number | null; error: any } {
    if (this.mode === "insert") {
      const res = this.db.insertRows(this.table, this.pending ?? []);
      if (res.error) return { data: null, count: null, error: res.error };
      return { data: res.rows, count: res.rows!.length, error: null };
    }
    if (this.mode === "update") {
      const hits = this.matching();
      for (const row of hits) Object.assign(row, this.patch);
      return { data: hits, count: hits.length, error: null };
    }
    let rows = this.matching();
    if (this.orderCol) {
      const { col, asc } = this.orderCol;
      rows = [...rows].sort((a, b) =>
        String(a[col]) < String(b[col])
          ? asc
            ? -1
            : 1
          : String(a[col]) > String(b[col])
            ? asc
              ? 1
              : -1
            : 0,
      );
    }
    const total = rows.length;
    if (this.rangeArgs) rows = rows.slice(this.rangeArgs[0], this.rangeArgs[1] + 1);
    return { data: rows, count: this.wantCount ? total : null, error: null };
  }

  async maybeSingle() {
    const res = this.run();
    if (res.error) return { data: null, error: res.error };
    const list = (res.data ?? []) as Row[];
    return { data: list[0] ?? null, error: null };
  }

  async single() {
    const res = this.run();
    if (res.error) return { data: null, error: res.error };
    const list = (res.data ?? []) as Row[];
    if (list.length !== 1) {
      return { data: null, error: { code: "PGRST116", message: "no rows returned" } };
    }
    return { data: list[0], error: null };
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?:
      | ((value: {
          data: any;
          count: number | null;
          error: any;
        }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }
}

/** Fresh DB pre-seeded with providers + rail settings for the given scenario. */
export function makePaymentsDb(
  providers: { code: string; mode: "sandbox" | "live"; enabled: boolean }[],
  railSettings: { rail: string; enabled: boolean }[] = [],
): FakeSupabaseAdmin {
  const db = new FakeSupabaseAdmin({
    unique: {
      payment_intents: ["idempotency_key", "reference"],
      payment_webhook_events: ["event_id", "body_hash"],
      payment_receipts: ["intent_id", "receipt_no"],
    },
  });
  db.seed(
    "payment_providers",
    providers.map((p) => ({
      ...p,
      label: p.code,
      config: {},
      secret_ref: `${p.code}_secret`,
      webhook_path: `/api/public/hooks/payments/${p.code}`,
    })),
  );
  db.seed("payment_rail_settings", railSettings);
  return db;
}
