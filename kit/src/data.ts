// 画面に渡すデータを、PCの中のファイル（data/*.json）から組み立てる。本番の web/lib/fetchStores.ts に当たる処理。
/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, readFileSync, statSync } from "fs";
import { pack, type Packed } from "../../web/lib/compact";
import type { Source, Store } from "../../web/lib/types";
import { inArea, type AreaConfig } from "./area";
import { writeJsonAtomic } from "./localdb-io";
import { P } from "./paths";

type Row = Record<string, any>;
export type Tables = { stores: Row[]; articles: Row[]; links: Row[]; sources: Row[]; state: Record<string, { last_crawled_at?: string }> };

let cache: { key: string; tables: Tables } | null = null;

function read<T>(file: string, fallback: T): T {
  if (!existsSync(file)) return fallback;
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

const FILES = () => [P.data("stores.json"), P.data("articles.json"), P.data("store_articles.json"), P.config("sources.json"), P.data("source_state.json")];

export function loadTables(): Tables {
  const key = FILES()
    .map((f) => (existsSync(f) ? `${statSync(f).mtimeMs}:${statSync(f).size}` : "-"))
    .join("|");
  if (cache?.key === key) return cache.tables;
  const conf = read<Row[]>(P.config("sources.json"), []);
  const tables: Tables = {
    stores: read<Row[]>(P.data("stores.json"), []),
    articles: read<Row[]>(P.data("articles.json"), []),
    links: read<Row[]>(P.data("store_articles.json"), []),
    sources: conf.map((s, i) => ({ source_type: "独立系ブログ", ...s, id: Number(s.id ?? i + 1) })),
    state: read(P.data("source_state.json"), {}),
  };
  cache = { key, tables };
  return tables;
}

export function lastCrawledAt(t: Tables = loadTables()): string | null {
  let best: string | null = null;
  for (const v of Object.values(t.state)) if (v.last_crawled_at && (!best || v.last_crawled_at > best)) best = v.last_crawled_at;
  return best;
}

// 本番の fetchStores.ts の toStore と同じ形にする
export function buildStores(area: AreaConfig, t: Tables = loadTables()): Store[] {
  const src = new Map(t.sources.map((s) => [s.id, s]));
  const art = new Map(t.articles.map((a) => [a.id, a]));
  const byStore = new Map<number, Row[]>();
  for (const l of t.links) {
    const a = art.get(l.article_id);
    if (a) (byStore.get(l.store_id) ?? byStore.set(l.store_id, []).get(l.store_id)!).push(a);
  }
  return t.stores
    .filter((r) => inArea(area, r.pref, r.city))
    .sort((a, b) => String(b.listed_date).localeCompare(String(a.listed_date)) || b.id - a.id)
    .map((r) => {
      const sources: Source[] = (byStore.get(r.id) ?? [])
        .sort((a, b) => String(b.published_at ?? "").localeCompare(String(a.published_at ?? "")) || String(a.article_url).localeCompare(String(b.article_url)))
        .map((a) => {
          const s = src.get(a.source_id);
          return { name: s?.name ?? "", url: a.article_url, type: (s?.source_type ?? "独立系ブログ") as Source["type"], title: a.title, publishedAt: a.published_at };
        });
      return {
        id: String(r.id),
        name: r.name,
        articleTitle: sources[0]?.title,
        addr: r.addr ?? "",
        pref: r.pref,
        city: r.city,
        date: r.listed_date,
        openDate: r.open_date ?? "",
        genre: r.genre ?? "その他",
        tel: r.tel ?? "",
        nearestStation: r.nearest_station ?? undefined,
        sources,
        duplicateFlag: !!r.duplicate_flag,
        duplicateOfId: r.duplicate_of_id ? String(r.duplicate_of_id) : undefined,
        createdAt: r.created_at,
      } as Store;
    });
}

export function buildPayload(area: AreaConfig): { data: Packed; meta: { lastCrawledAt: string | null; windowDays: number; olderCount: number }; area: AreaConfig & { prefectures: string[] } } {
  const t = loadTables();
  const stores = buildStores(area, t);
  const prefectures = area.areas.map((a) => a.pref);
  return {
    data: pack(stores, prefectures),
    meta: { lastCrawledAt: lastCrawledAt(t), windowDays: KEEP_DAYS, olderCount: 0 },
    area: { ...area, prefectures },
  };
}

// 2年より前の店・記事は消す（本番の purge.ts と同じ）
export const KEEP_DAYS = 730;
export function purgeOld(): { stores: number; articles: number } {
  const t = loadTables();
  const cutoff = new Date(Date.now() - KEEP_DAYS * 86400000).toISOString();
  const cutDate = cutoff.slice(0, 10);
  const oldStores = new Set(t.stores.filter((s) => s.listed_date && s.listed_date < cutDate).map((s) => s.id));
  const oldArticles = new Set(t.articles.filter((a) => a.published_at && a.published_at < cutoff).map((a) => a.id));
  if (!oldStores.size && !oldArticles.size) return { stores: 0, articles: 0 };
  const stores = t.stores.filter((s) => !oldStores.has(s.id)).map((s) => (oldStores.has(s.duplicate_of_id) ? { ...s, duplicate_of_id: null } : s));
  const articles = t.articles.filter((a) => !oldArticles.has(a.id));
  const links = t.links.filter((l) => !oldStores.has(l.store_id) && !oldArticles.has(l.article_id));
  writeJsonAtomic(P.data("stores.json"), stores);
  writeJsonAtomic(P.data("articles.json"), articles);
  writeJsonAtomic(P.data("store_articles.json"), links);
  cache = null;
  return { stores: oldStores.size, articles: oldArticles.size };
}

// 情報源ごとの状況（画面の「情報源の状況」）
export function sourceStats(t: Tables = loadTables()) {
  const now = Date.now();
  const storeIdsByArticle = new Map<number, number>();
  for (const l of t.links) storeIdsByArticle.set(l.article_id, (storeIdsByArticle.get(l.article_id) ?? 0) + 1);
  const bySource = new Map<number, { articles: number; withStore: number; lastOpen: string | null }>();
  for (const a of t.articles) {
    const st = bySource.get(a.source_id) ?? { articles: 0, withStore: 0, lastOpen: null };
    st.articles++;
    if (storeIdsByArticle.has(a.id)) {
      st.withStore++;
      if (!st.lastOpen || a.published_at > st.lastOpen) st.lastOpen = a.published_at;
    }
    bySource.set(a.source_id, st);
  }
  return t.sources.map((s) => {
    const st = bySource.get(s.id) ?? { articles: 0, withStore: 0, lastOpen: null };
    const crawled = t.state[String(s.id)]?.last_crawled_at ?? null;
    const days = st.lastOpen ? Math.floor((now - Date.parse(st.lastOpen)) / 86400000) : null;
    const status = s.enabled === false ? "止めている" : !crawled ? "まだ巡回していない" : days === null ? "開店記事なし" : days > 180 ? "開店記事なし（180日以上）" : days > 60 ? "少ない（60日以上なし）" : "正常";
    return { id: s.id, name: s.name, pref: s.pref, city: s.city ?? "", url: s.url, feed: s.rss_url, crawled, ...st, status };
  });
}
