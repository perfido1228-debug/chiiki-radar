import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";

export const metadata: Metadata = { title: "情報源の状況 | 地域密着レーダー" };
export const revalidate = 300;

type SourceRow = {
  id: number;
  name: string;
  url: string;
  rss_url: string | null;
  source_type: string;
  pref: string | null;
  city: string | null;
  enabled: boolean;
  last_crawled_at: string | null;
};

type ArticleRow = { source_id: number; published_at: string; store_articles: Array<{ store_id: number }> };

type Status = "error" | "dormant" | "slow" | "ok" | "disabled";
const STATUS_LABEL: Record<Status, string> = {
  error: "取得できていない",
  dormant: "開店記事なし（180日以上）",
  slow: "開店記事が少ない（60日以上なし）",
  ok: "正常",
  disabled: "無効",
};
const STATUS_ORDER: Status[] = ["error", "dormant", "slow", "ok", "disabled"];
const PREF_ORDER = ["東京都", "神奈川県", "千葉県", "埼玉県", "愛知県", "大阪府", "京都府"];
const DAY = 86400000;

const fmt = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
const fmtDate = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "numeric", day: "numeric" });

async function load() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const sources: SourceRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("sources").select("id, name, url, rss_url, source_type, pref, city, enabled, last_crawled_at").order("id").range(from, from + 999);
    if (error) throw new Error(error.message);
    sources.push(...((data ?? []) as SourceRow[]));
    if (!data || data.length < 1000) break;
  }
  const since = new Date(Date.now() - 365 * DAY).toISOString();
  const articles: ArticleRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("articles").select("source_id, published_at, store_articles(store_id)").gte("published_at", since).order("id").range(from, from + 999);
    if (error) throw new Error(error.message);
    articles.push(...((data ?? []) as unknown as ArticleRow[]));
    if (!data || data.length < 1000) break;
  }
  return { sources, articles };
}

export default async function SourcesPage() {
  let data: Awaited<ReturnType<typeof load>>;
  try {
    data = await load();
  } catch (e) {
    return (
      <main>
        <div className="empty">情報源の状況を読み込めませんでした（{(e as Error).message}）</div>
      </main>
    );
  }
  const now = Date.now();
  const latestCrawl = Math.max(0, ...data.sources.map((s) => (s.last_crawled_at ? Date.parse(s.last_crawled_at) : 0)));

  const stats = new Map<number, { last: number; recent: number; total: number }>();
  for (const a of data.articles) {
    const st = stats.get(a.source_id) ?? { last: 0, recent: 0, total: 0 };
    const t = Date.parse(a.published_at);
    const hasStore = (a.store_articles ?? []).length > 0;
    if (hasStore) {
      st.last = Math.max(st.last, t);
      st.total++;
      if (now - t <= 90 * DAY) st.recent++;
    }
    stats.set(a.source_id, st);
  }

  const rows = data.sources.map((s) => {
    const st = stats.get(s.id) ?? { last: 0, recent: 0, total: 0 };
    const crawled = s.last_crawled_at ? Date.parse(s.last_crawled_at) : 0;
    let status: Status;
    if (!s.enabled) status = "disabled";
    else if (!crawled || latestCrawl - crawled > 12 * 3600 * 1000) status = "error";
    else if (!st.last || now - st.last > 180 * DAY) status = "dormant";
    else if (now - st.last > 60 * DAY) status = "slow";
    else status = "ok";
    return { s, st, crawled, status };
  });
  rows.sort(
    (a, b) =>
      STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
      PREF_ORDER.indexOf(a.s.pref ?? "") - PREF_ORDER.indexOf(b.s.pref ?? "") ||
      a.s.name.localeCompare(b.s.name, "ja"),
  );
  const counts = Object.fromEntries(STATUS_ORDER.map((k) => [k, rows.filter((r) => r.status === k).length])) as Record<Status, number>;
  const byPref = PREF_ORDER.map((p) => ({
    pref: p,
    sources: rows.filter((r) => r.s.pref === p && r.s.enabled).length,
    recent: rows.filter((r) => r.s.pref === p).reduce((acc, r) => acc + r.st.recent, 0),
  }));

  return (
    <main className="sources-page">
      <h2>情報源の状況</h2>
      <p className="lead">
        登録している {data.sources.length} サイトの巡回状況です（5分ごとに更新）。最終巡回：
        {latestCrawl ? fmt.format(new Date(latestCrawl)) : "なし"}
      </p>
      <div className="status-summary">
        {STATUS_ORDER.map((k) => (
          <span key={k} className={`status-chip ${k}`}>
            {STATUS_LABEL[k]} <b>{counts[k]}</b>
          </span>
        ))}
      </div>
      <ul className="status-help">
        <li>
          <b>取得できていない</b>：他のサイトは巡回できているのに、このサイトだけ12時間以上読めていません。フィードのURL変更・サイト閉鎖の可能性があります。
        </li>
        <li>
          <b>開店記事なし／少ない</b>：サイトは読めていますが、開店の記事を長く取り込めていません。サイトの更新が止まっているか、開店記事の少ない地域です。同じ地域の別の情報源を探す目安にしてください。
        </li>
      </ul>
      <table className="pref-table">
        <thead>
          <tr>
            {byPref.map((p) => (
              <th key={p.pref}>{p.pref}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {byPref.map((p) => (
              <td key={p.pref}>
                {p.sources}サイト
                <br />
                直近90日 {p.recent}店
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <div className="table-wrap">
        <table className="sources-table">
          <thead>
            <tr>
              <th>状態</th>
              <th>情報源</th>
              <th>種別</th>
              <th>地域</th>
              <th>最終巡回</th>
              <th>最後に取り込んだ開店記事</th>
              <th>直近90日の店</th>
              <th>1年間の店</th>
              <th>フィード</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ s, st, crawled, status }) => (
              <tr key={s.id} className={status}>
                <td>
                  <span className={`status-chip ${status}`}>{STATUS_LABEL[status]}</span>
                </td>
                <td>
                  <a href={s.url} target="_blank" rel="noopener noreferrer">
                    {s.name}
                  </a>
                </td>
                <td>{s.source_type}</td>
                <td>
                  {s.pref}
                  {s.city ? ` ${s.city}` : ""}
                </td>
                <td>{crawled ? fmt.format(new Date(crawled)) : "—"}</td>
                <td>{st.last ? `${fmtDate.format(new Date(st.last))}（${Math.floor((now - st.last) / DAY)}日前）` : "1年以上なし"}</td>
                <td className="num">{st.recent}</td>
                <td className="num">{st.total}</td>
                <td>
                  {s.rss_url && (
                    <a href={s.rss_url} target="_blank" rel="noopener noreferrer">
                      RSS
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
