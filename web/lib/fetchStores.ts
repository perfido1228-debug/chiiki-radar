import { createClient } from "@supabase/supabase-js";
import type { Pref, RadarMeta, Source, Store } from "./types";
import { pack, type Packed } from "./compact";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

// 最初に読み込む期間（日）。これより前の店は画面の「さらに古い店も読み込む」で取得する
export const WINDOW_DAYS = 120;
// Supabase は1回の問い合わせで最大1000行までしか返さない（以前はこれで一覧が1000件で止まっていた）
const PAGE = 1000;

const SELECT =
  "id, name, addr, pref, city, tel, genre, nearest_station, open_date, listed_date, duplicate_flag, duplicate_of_id, created_at," +
  " store_articles(articles(article_url, title, published_at, sources(name, source_type)))";

type Row = {
  id: number;
  name: string;
  addr: string | null;
  pref: string;
  city: string;
  tel: string | null;
  genre: string | null;
  nearest_station: string | null;
  open_date: string | null;
  listed_date: string;
  duplicate_flag: boolean;
  duplicate_of_id: number | null;
  created_at: string;
  store_articles: Array<{
    articles: {
      article_url: string;
      title: string;
      published_at: string;
      sources: { name: string; source_type: string } | null;
    } | null;
  }>;
};

function client() {
  return createClient(url, key, { auth: { persistSession: false } });
}

// 日本時間で「今日から days 日前」の日付（YYYY-MM-DD）
export function jstDaysAgo(days: number, now = new Date()): string {
  const j = new Date(now.getTime() + 9 * 3600 * 1000 - days * 86400000);
  return j.toISOString().slice(0, 10);
}

function toStore(r: Row): Store {
  const sources: Source[] = (r.store_articles ?? [])
    .map((sa) => sa.articles)
    .filter((a): a is NonNullable<typeof a> => !!a)
    .sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""))
    .map((a) => ({
      name: a.sources?.name ?? "",
      url: a.article_url,
      type: (a.sources?.source_type ?? "独立系ブログ") as Source["type"],
      title: a.title,
      publishedAt: a.published_at,
    }));
  return {
    id: String(r.id),
    name: r.name,
    articleTitle: sources[0]?.title,
    addr: r.addr ?? "",
    pref: r.pref as Pref,
    city: r.city,
    date: r.listed_date,
    openDate: r.open_date ?? "",
    genre: r.genre ?? "その他",
    tel: r.tel ?? "",
    nearestStation: r.nearest_station ?? undefined,
    sources,
    duplicateFlag: r.duplicate_flag,
    duplicateOfId: r.duplicate_of_id ? String(r.duplicate_of_id) : undefined,
    createdAt: r.created_at,
  };
}

// 掲載日の範囲で店を全件取得する（1000件ずつ）
export async function fetchStoreRange(opts: { pref?: string; since?: string; before?: string; offset?: number; limit?: number }): Promise<Store[]> {
  const sb = client();
  const out: Store[] = [];
  const limit = opts.limit ?? Infinity;
  for (let from = opts.offset ?? 0; out.length < limit; from += PAGE) {
    let q = sb.from("stores").select(SELECT).order("listed_date", { ascending: false }).order("id", { ascending: false });
    if (opts.pref) q = q.eq("pref", opts.pref);
    if (opts.since) q = q.gte("listed_date", opts.since);
    if (opts.before) q = q.lt("listed_date", opts.before);
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw new Error(`店の取得に失敗: ${error.message}`);
    const rows = (data ?? []) as unknown as Row[];
    out.push(...rows.map(toStore));
    if (rows.length < PAGE) break;
  }
  return out;
}

export async function fetchRadarData(pref?: string): Promise<{ data: Packed; meta: RadarMeta }> {
  const sb = client();
  const since = jstDaysAgo(WINDOW_DAYS);
  try {
    const [stores, older, crawled] = await Promise.all([
      fetchStoreRange({ pref, since }),
      (() => {
        let q = sb.from("stores").select("id", { count: "exact", head: true }).lt("listed_date", since);
        if (pref) q = q.eq("pref", pref);
        return q;
      })(),
      sb.from("sources").select("last_crawled_at").not("last_crawled_at", "is", null).order("last_crawled_at", { ascending: false }).limit(1),
    ]);
    return {
      data: pack(stores),
      meta: {
        generatedAt: new Date().toISOString(),
        lastCrawledAt: (crawled.data?.[0]?.last_crawled_at as string | undefined) ?? null,
        windowDays: WINDOW_DAYS,
        olderCount: older.count ?? 0,
      },
    };
  } catch (e) {
    console.error("fetchRadarData error:", e);
    return { data: pack([]), meta: { generatedAt: new Date().toISOString(), lastCrawledAt: null, windowDays: WINDOW_DAYS, olderCount: 0 } };
  }
}
