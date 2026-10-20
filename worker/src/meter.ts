// D1 write metering: a D1Database wrapper that adds up meta.rows_written / rows_read of every statement it runs,
// so each pass records what it costs (D1 bills rows written, and counts every index entry a write touches).
export interface Meter { w: number; r: number }

const REAL = new WeakMap<object, D1PreparedStatement>();

function add(m: Meter, res: any) {
  const x = res && res.meta;
  if (x) { m.w += x.rows_written || 0; m.r += x.rows_read || 0; }
  return res;
}

function wrapStmt(s: D1PreparedStatement, m: Meter): D1PreparedStatement {
  const p = new Proxy(s, {
    get(t, k) {
      if (k === "bind") return (...a: unknown[]) => wrapStmt(t.bind(...a), m);
      if (k === "run" || k === "all") return async (...a: any[]) => add(m, await (t as any)[k](...a));
      const v = (t as any)[k];
      return typeof v === "function" ? v.bind(t) : v;
    },
  });
  REAL.set(p, s);
  return p;
}

export function metered(db: D1Database, m: Meter): D1Database {
  return new Proxy(db, {
    get(t, k) {
      if (k === "prepare") return (q: string) => wrapStmt(t.prepare(q), m);
      if (k === "batch") return async (stmts: D1PreparedStatement[]) => {
        const res = await t.batch(stmts.map(s => REAL.get(s) ?? s));
        for (const r of res) add(m, r);
        return res;
      };
      if (k === "exec") return async (q: string) => t.exec(q);
      const v = (t as any)[k];
      return typeof v === "function" ? v.bind(t) : v;
    },
  });
}

/** An env whose DB is metered (every other binding is inherited). */
export function withMeter<E extends { DB: D1Database }>(env: E, m: Meter): E {
  return Object.assign(Object.create(env), { DB: metered(env.DB, m) });
}

/** Per-pass totals, by stage (step name without its slice number). */
export class PassMeter {
  w = 0; r = 0; by: Record<string, number> = {}; rby: Record<string, number> = {};
  add(name: string, w: number, r: number) {
    this.w += w; this.r += r;
    const stage = name.replace(/-\d+$/, "").replace(/^r\d+-/, "");
    this.by[stage] = (this.by[stage] || 0) + w;
    this.rby[stage] = (this.rby[stage] || 0) + r;
  }
  toJSON() { return { rows_written: this.w, rows_read: this.r, written_by_stage: this.by, read_by_stage: this.rby }; }
}
