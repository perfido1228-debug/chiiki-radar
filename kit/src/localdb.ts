// 配布キット用の小さなデータベース。
// 本番の web/scripts/lib/supabase.ts の代わりにビルドで差し替えられ、巡回（crawl.ts）と重複判定（dedupe.ts）が使う
// 問い合わせだけを、PCの中のファイルで再現する（Supabase の書き方のうち、使っている分だけ）。
//
//   data/articles.json        記事
//   data/stores.json          店
//   data/store_articles.json  店と記事のつながり
//   data/source_state.json    情報源ごとの前回の巡回日時
//   config/sources.json       情報源の設定（読むだけ）
//
// 新しく足した情報源は「120日前に巡回した」扱いにして、初回の巡回で過去の記事も遡って取り込む。
/* eslint-disable @typescript-eslint/no-explicit-any */
import { mkdirSync, unlinkSync, writeFileSync } from "fs";
import { readJson, writeJsonAtomic } from "./localdb-io";
import { P } from "./paths";

type Row = Record<string, any>;
type DbError = { message: string };
type Result = { data: any; error: DbError | null; count?: number | null };

const DRY_RUN = process.argv.includes("--dry-run");
const BACKFILL_DAYS = 121;
const EXTRA_ID = 999999;
const LOCK = P.data("crawl.lock");

const UNIQUE: Record<string, string[][]> = {
  articles: [["article_url"]],
  sources: [["url"]],
  store_articles: [["store_id", "article_id"]],
};
const HAS_ID = new Set(["articles", "stores", "sources"]);
const HAS_CREATED_AT = new Set(["articles", "stores"]);

class Db {
  tables: Record<string, Row[]> = {};
  maxId: Record<string, number> = {};
  dirty = new Set<string>();
  writes = 0;
  loaded = false;

  load(): void {
    if (this.loaded) return;
    this.loaded = true;
    mkdirSync(P.data(""), { recursive: true });
    for (const t of ["articles", "stores", "store_articles"]) this.tables[t] = readJson<Row[]>(P.data(`${t}.json`), []);
    const conf = readJson<Row[]>(P.config("sources.json"), []);
    const state = readJson<Record<string, { last_crawled_at?: string }>>(P.data("source_state.json"), {});
    const backfill = new Date(Date.now() - BACKFILL_DAYS * 86400000).toISOString();
    const rows: Row[] = conf.map((s, i) => {
      const id = Number(s.id ?? i + 1);
      return { source_type: "独立系ブログ", city: null, enabled: true, rules: null, ...s, id, last_crawled_at: state[String(id)]?.last_crawled_at ?? backfill };
    });
    // tools/check-source が試し読みに渡す情報源（登録はしない）
    if (process.env.KIT_EXTRA_SOURCE) {
      rows.push({ source_type: "独立系ブログ", city: null, rules: null, ...JSON.parse(process.env.KIT_EXTRA_SOURCE), id: EXTRA_ID, enabled: true, last_crawled_at: backfill });
    }
    this.tables.sources = rows;
    for (const [t, list] of Object.entries(this.tables)) {
      this.maxId[t] = list.reduce((m, r) => (r.id === EXTRA_ID ? m : Math.max(m, Number(r.id) || 0)), 0);
    }
  }

  save(): void {
    if (DRY_RUN || !this.loaded) return;
    for (const t of this.dirty) {
      if (t === "sources") {
        const prev = readJson<Record<string, { last_crawled_at?: string }>>(P.data("source_state.json"), {});
        for (const s of this.tables.sources) {
          if (s.id !== EXTRA_ID) prev[String(s.id)] = { last_crawled_at: s.last_crawled_at };
        }
        writeJsonAtomic(P.data("source_state.json"), prev);
      } else {
        writeJsonAtomic(P.data(`${t}.json`), this.tables[t]);
      }
    }
    this.dirty.clear();
  }

  touched(table: string): void {
    this.dirty.add(table);
    if (++this.writes % 200 === 0) this.save();
  }
}

const db = new Db();

// 同時に2つの巡回が動かないようにする（画面の自動巡回と「今すぐ巡回」が重なった場合など）
function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}
let ownLock = false;
if (!DRY_RUN) {
  mkdirSync(P.data(""), { recursive: true });
  try {
    const l = readJson<{ pid?: number; started?: number } | null>(LOCK, null);
    if (l?.pid && l.started && Date.now() - l.started < 3 * 3600 * 1000 && l.pid !== process.pid && pidAlive(l.pid)) {
      console.log("別の巡回が動いているので、今回は見送ります。");
      process.exit(0);
    }
  } catch {
    // 壊れた札は上書きする
  }
  writeFileSync(LOCK, JSON.stringify({ pid: process.pid, started: Date.now() }));
  ownLock = true;
}
process.on("exit", () => {
  db.save();
  if (ownLock) {
    try {
      unlinkSync(LOCK);
    } catch {
      // すでに無い
    }
  }
});

function likeRe(pattern: string, insensitive: boolean): RegExp {
  const body = pattern
    .split("")
    .map((ch) => (ch === "%" ? ".*" : ch === "_" ? "." : ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    .join("");
  return new RegExp(`^${body}$`, insensitive ? "is" : "s");
}

function project(row: Row, cols: string): Row {
  if (cols.trim() === "*") return { ...row };
  const out: Row = {};
  for (const c of cols.split(",").map((x) => x.trim()).filter((x) => x && !x.includes("("))) out[c] = row[c];
  return out;
}

class Query implements PromiseLike<Result> {
  private filters: ((r: Row) => boolean)[] = [];
  private orders: { col: string; asc: boolean }[] = [];
  private rangeFrom?: number;
  private rangeTo?: number;
  private lim?: number;
  private cols = "*";
  private headOnly = false;
  private op: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private payload: Row[] = [];
  private patch: Row = {};
  private conflict?: string[];
  private returning = false;
  private single_ = false;
  private maybe_ = false;

  constructor(private table: string) {
    db.load();
    db.tables[table] ??= [];
  }

  select(cols = "*", opts?: { count?: string; head?: boolean }): this {
    this.cols = cols;
    if (this.op === "select") this.headOnly = !!opts?.head;
    else this.returning = true;
    return this;
  }
  insert(rows: Row | Row[]): this {
    this.op = "insert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  upsert(rows: Row | Row[], opts?: { onConflict?: string }): this {
    this.op = "upsert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    this.conflict = opts?.onConflict?.split(",").map((s) => s.trim());
    return this;
  }
  update(patch: Row): this {
    this.op = "update";
    this.patch = patch;
    return this;
  }
  delete(): this {
    this.op = "delete";
    return this;
  }
  eq(c: string, v: unknown): this {
    this.filters.push((r) => r[c] === v);
    return this;
  }
  neq(c: string, v: unknown): this {
    this.filters.push((r) => r[c] !== v);
    return this;
  }
  in(c: string, vs: unknown[]): this {
    const s = new Set(vs);
    this.filters.push((r) => s.has(r[c]));
    return this;
  }
  like(c: string, p: string): this {
    const re = likeRe(p, false);
    this.filters.push((r) => typeof r[c] === "string" && re.test(r[c]));
    return this;
  }
  ilike(c: string, p: string): this {
    const re = likeRe(p, true);
    this.filters.push((r) => typeof r[c] === "string" && re.test(r[c]));
    return this;
  }
  is(c: string, v: unknown): this {
    this.filters.push((r) => (v === null ? r[c] == null : r[c] === v));
    return this;
  }
  not(c: string, op: string, v: unknown): this {
    if (op === "is" && v === null) this.filters.push((r) => r[c] != null);
    else if (op === "eq") this.filters.push((r) => r[c] !== v);
    else throw new Error(`未対応の条件: not ${op}`);
    return this;
  }
  gte(c: string, v: any): this {
    this.filters.push((r) => r[c] != null && r[c] >= v);
    return this;
  }
  gt(c: string, v: any): this {
    this.filters.push((r) => r[c] != null && r[c] > v);
    return this;
  }
  lte(c: string, v: any): this {
    this.filters.push((r) => r[c] != null && r[c] <= v);
    return this;
  }
  lt(c: string, v: any): this {
    this.filters.push((r) => r[c] != null && r[c] < v);
    return this;
  }
  // 「name.ilike.%キーワード%,url.ilike.%キーワード%」の形
  or(expr: string): this {
    const conds = expr.split(",").map((part) => {
      const m = part.match(/^([^.]+)\.(eq|neq|like|ilike|is)\.(.*)$/);
      if (!m) throw new Error(`未対応の条件: ${part}`);
      const [, c, op, v] = m;
      if (op === "eq") return (r: Row) => String(r[c]) === v;
      if (op === "neq") return (r: Row) => String(r[c]) !== v;
      if (op === "is") return (r: Row) => (v === "null" ? r[c] == null : String(r[c]) === v);
      const re = likeRe(v, op === "ilike");
      return (r: Row) => typeof r[c] === "string" && re.test(r[c]);
    });
    this.filters.push((r) => conds.some((f) => f(r)));
    return this;
  }
  order(c: string, o?: { ascending?: boolean }): this {
    this.orders.push({ col: c, asc: o?.ascending !== false });
    return this;
  }
  range(from: number, to: number): this {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }
  limit(n: number): this {
    this.lim = n;
    return this;
  }
  single(): this {
    this.single_ = true;
    return this;
  }
  maybeSingle(): this {
    this.single_ = true;
    this.maybe_ = true;
    return this;
  }

  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, ng?: ((e: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    let res: Result;
    try {
      res = this.exec();
    } catch (e) {
      return Promise.reject(e).then(ok, ng);
    }
    return Promise.resolve(res).then(ok, ng);
  }

  private matched(): Row[] {
    return db.tables[this.table].filter((r) => this.filters.every((f) => f(r)));
  }

  private finish(rows: Row[]): Result {
    const data = rows.map((r) => project(r, this.cols));
    if (!this.single_) return { data, error: null };
    if (data.length === 1) return { data: data[0], error: null };
    if (data.length === 0 && this.maybe_) return { data: null, error: null };
    return { data: null, error: { message: `1件のはずが ${data.length} 件でした` } };
  }

  private violates(row: Row): boolean {
    for (const cols of UNIQUE[this.table] ?? []) {
      if (db.tables[this.table].some((r) => cols.every((c) => r[c] === row[c]))) return true;
    }
    return false;
  }

  private add(row: Row): Row {
    const r: Row = { ...row };
    if (HAS_ID.has(this.table) && r.id == null) r.id = ++db.maxId[this.table];
    if (HAS_CREATED_AT.has(this.table) && !r.created_at) r.created_at = new Date().toISOString();
    db.tables[this.table].push(r);
    return r;
  }

  private exec(): Result {
    const tbl = db.tables[this.table];
    switch (this.op) {
      case "select": {
        let rows = this.matched();
        if (this.headOnly) return { data: null, error: null, count: rows.length };
        for (const o of [...this.orders].reverse()) {
          rows = [...rows].sort((a, b) => {
            const x = a[o.col];
            const y = b[o.col];
            const c = x === y ? 0 : x == null ? 1 : y == null ? -1 : x < y ? -1 : 1;
            return o.asc ? c : -c;
          });
        }
        if (this.rangeFrom !== undefined) rows = rows.slice(this.rangeFrom, (this.rangeTo ?? rows.length) + 1);
        if (this.lim !== undefined) rows = rows.slice(0, this.lim);
        return this.finish(rows);
      }
      case "insert": {
        for (const row of this.payload) {
          if (this.violates(row)) return { data: null, error: { message: "duplicate key value violates unique constraint" } };
        }
        const added = this.payload.map((row) => this.add(row));
        db.touched(this.table);
        return this.returning ? this.finish(added) : { data: null, error: null };
      }
      case "upsert": {
        const keys = this.conflict ?? UNIQUE[this.table]?.[0] ?? ["id"];
        const out: Row[] = [];
        for (const row of this.payload) {
          const hit = tbl.find((r) => keys.every((k) => r[k] === row[k]));
          if (hit) {
            Object.assign(hit, row);
            out.push(hit);
          } else out.push(this.add(row));
        }
        db.touched(this.table);
        return this.returning ? this.finish(out) : { data: null, error: null };
      }
      case "update": {
        const rows = this.matched();
        for (const r of rows) Object.assign(r, this.patch);
        if (rows.length) db.touched(this.table);
        return this.returning ? this.finish(rows) : { data: null, error: null };
      }
      case "delete": {
        const rows = new Set(this.matched());
        db.tables[this.table] = tbl.filter((r) => !rows.has(r));
        if (rows.size) db.touched(this.table);
        return { data: null, error: null };
      }
    }
  }
}

export const sb = {
  from(table: string): Query {
    return new Query(table);
  },
};
