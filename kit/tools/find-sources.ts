// 対象の地域の「情報源の候補」を集めて、今も更新されているか・開店の記事が出ているかを確かめる。
// 集める先:
//   1. 確認済み … 本番の地域密着レーダーで使っている情報源（masters/known-sources.json。1都3県・愛知・大阪・京都）
//   2. 号外NET … https://goguynet.jp/ の地域版（「開店・閉店」カテゴリのフィード）
//   3. みんなの経済新聞 … masters/minkei-editions.json の各版（rss.xml）
//   4. リビングWeb「開店・閉店」 … masters/living-editions.json の地域版
//   5. 地域メディア名鑑 … https://news.gotouti.jp/ の都道府県ページに載っているサイト（フィードを探して確かめる）
//   6. 全国版 … メシナビ（飲食店の開店・閉店専門）、居抜き店舗.com（1都3県のみ）
// 使い方: node tools/find-sources.mjs [--no-directory] [--concurrency=6]
//   地域は config/area.json から読む。結果は work/candidates.md（読む用）と work/candidates.json（tools/sources.mjs が使う）。
// 名鑑に載っていない個人ブログなどは拾えないので、CLAUDE.md の手順でWeb検索して足す。
import * as cheerio from "cheerio";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import Parser from "rss-parser";
import { parseLivingList } from "../../web/scripts/lib/living";
import { loadArea, loadMaster, type AreaPart } from "../src/area";
import { P } from "../src/paths";

const args = process.argv.slice(2);
const CONCURRENCY = Number(args.find((a) => a.startsWith("--concurrency="))?.split("=")[1] ?? 6);
const NO_DIRECTORY = args.includes("--no-directory");
const UA = "Mozilla/5.0 (compatible; ChiikiRadar-Kit/1.0)";
const DAY = 86400000;
const OPEN_RE = /開店|オープン|OPEN|新店|開業|グランドオープン|移転/i;
const ITENPO_PREFS = ["東京都", "神奈川県", "埼玉県", "千葉県"];

type Cand = {
  id: string;
  group: string;
  name: string;
  site: string;
  feed: string;
  type: string;
  pref: string;
  city: string | null;
  note?: string;
  rules?: Record<string, unknown>;
  status?: string;
  newest?: string | null;
  recent30?: number;
  openingHits?: number;
  sample?: string[];
  error?: string;
};

const parser = new Parser({ timeout: 20000, headers: { "User-Agent": UA } });
const master = loadMaster();
const area = loadArea();
if (!area) {
  console.error("地域が設定されていません。先に node tools/area.mjs set ... で地域を決めてください。");
  process.exit(1);
}

async function fetchText(url: string, timeoutMs = 20000): Promise<{ status: number; body: string; finalUrl: string }> {
  const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
  return { status: res.status, body: res.ok ? await res.text() : "", finalUrl: res.url || url };
}

type Item = { title: string; date: number | null };
async function readFeed(url: string): Promise<Item[]> {
  let feed: Awaited<ReturnType<typeof parser.parseURL>>;
  try {
    feed = await parser.parseURL(url);
  } catch {
    const { status, body } = await fetchText(url);
    if (status < 200 || status >= 300) throw new Error(`HTTP ${status}`);
    const fixed = body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/&(?!(?:[a-zA-Z][a-zA-Z0-9]*|#\d+|#x[0-9a-fA-F]+);)/g, "&amp;");
    feed = await parser.parseString(fixed);
  }
  return (feed.items ?? []).map((it) => {
    const d = Date.parse(it.isoDate ?? it.pubDate ?? "");
    return { title: String(it.title ?? "").trim(), date: Number.isNaN(d) ? null : d };
  });
}

// 市区町村の手がかり（「北海道旭川市」「江戸川区」「京田辺市・木津川市・精華町」など）から、一覧の市区町村名を拾う
function citiesIn(text: string, pref: string): string[] {
  const t = text.replace(pref, "");
  const list = master[pref] ?? [];
  const hits = new Set<string>();
  for (const c of list) {
    const base = c.replace(/^(.+?市).+区$/, "$1");
    const plain = c.replace(/^.+?郡/, "");
    if (t.includes(c)) hits.add(c);
    else if (t.includes(base) && base !== c) hits.add(base);
    else if (plain !== c && t.includes(plain)) hits.add(c);
  }
  // 政令市名と区の両方が拾えた場合は区を残す
  for (const h of [...hits]) if ([...hits].some((x) => x !== h && x.startsWith(h))) hits.delete(h);
  return [...hits];
}

// 選んだ市区町村に関係あるか（市区町村を選んでいなければ都道府県全体が対象）
function relevant(part: AreaPart, cities: string[]): boolean {
  if (!part.cities.length) return true;
  if (!cities.length) return true; // 都道府県全体を扱うサイト
  return cities.some((c) => part.cities.some((s) => c === s || c.startsWith(s) || s.startsWith(c)));
}
const oneCity = (cities: string[]) => (cities.length === 1 ? cities[0] : null);
const norm = (u: string) => u.replace(/^https?:\/\//, "").replace(/\/+$/, "").toLowerCase();

async function goguynetEditions(): Promise<Record<string, Array<{ host: string; label: string }>>> {
  const { body } = await fetchText("https://goguynet.jp/");
  const out: Record<string, Array<{ host: string; label: string }>> = {};
  for (const block of body.split('<div class="area-label"><span>').slice(1)) {
    const pref = block.split("</span>", 1)[0];
    const ul = block.split("</ul>", 1)[0];
    for (const m of ul.matchAll(/<a href="https?:\/\/([a-z0-9-]+\.goguynet\.jp)\/?"[^>]*>([\s\S]*?)<\/a>/g)) {
      const label = m[2].replace(/<[^>]+>[^<]*<\/[^>]+>/g, "").replace(/<[^>]+>/g, "").trim();
      const list = (out[pref] ??= []);
      if (!list.some((x) => x.host === m[1])) list.push({ host: m[1], label });
    }
  }
  return out;
}

async function directoryEntries(pref: string): Promise<Array<{ name: string; entry: string; region: string }>> {
  const top = await fetchText("https://news.gotouti.jp/");
  const $ = cheerio.load(top.body);
  const link = $("a")
    .toArray()
    .map((a) => ({ href: $(a).attr("href") ?? "", text: $(a).text().trim() }))
    .find((a) => a.text === pref && a.href.startsWith("https://news.gotouti.jp/"));
  if (!link) return [];
  const page = await fetchText(link.href);
  const $$ = cheerio.load(page.body);
  return $$("ul.lcp_catlist li")
    .toArray()
    .map((li) => ({
      name: $$(li).find("a").first().text().trim(),
      entry: $$(li).find("a").first().attr("href") ?? "",
      region: $$(li).find(".lcp-customfield").text().replace(/のローカル.*$/, "").trim(),
    }))
    .filter((e) => e.entry);
}

async function directorySite(entryUrl: string): Promise<{ site: string; region: string } | null> {
  const { body } = await fetchText(entryUrl, 15000);
  const $ = cheerio.load(body);
  let site = "";
  let region = "";
  $("dt").each((_, dt) => {
    const k = $(dt).text().trim();
    const dd = $(dt).next("dd");
    if (k === "URL") site = dd.find("a").attr("href") ?? dd.text().trim();
    if (k === "行政区域") region = dd.text().trim();
  });
  return site ? { site, region } : null;
}

async function discoverFeed(site: string): Promise<string | null> {
  const u = new URL(site);
  if (u.host === "ameblo.jp") {
    const id = u.pathname.split("/").filter(Boolean)[0];
    if (id) return `https://rssblog.ameba.jp/${id}/rss20.xml`;
  }
  if (u.host === "note.com") {
    const id = u.pathname.split("/").filter(Boolean)[0];
    if (id) return `https://note.com/${id}/rss`;
  }
  const tries: string[] = [];
  try {
    const { body, finalUrl } = await fetchText(site, 15000);
    const $ = cheerio.load(body);
    $('link[rel="alternate"]').each((_, l) => {
      const type = $(l).attr("type") ?? "";
      const href = $(l).attr("href") ?? "";
      if (/rss|atom|rdf/.test(type) && href && !/comments/.test(href)) tries.push(new URL(href, finalUrl).toString());
    });
    for (const p of ["feed/", "index.rdf", "rss.xml", "?feed=rss2"]) tries.push(new URL(p, finalUrl.endsWith("/") ? finalUrl : `${finalUrl}/`).toString());
  } catch {
    for (const p of ["feed/", "index.rdf"]) tries.push(new URL(p, site.endsWith("/") ? site : `${site}/`).toString());
  }
  for (const f of [...new Set(tries)].slice(0, 6)) {
    try {
      if ((await readFeed(f)).length) return f;
    } catch {
      // 次を試す
    }
  }
  return null;
}

async function inspect(c: Cand): Promise<void> {
  try {
    let items: Item[];
    if (/^https:\/\/mrs\.living\.jp\/[a-z_-]+\/newopen\/?$/.test(c.feed)) {
      const { status, body } = await fetchText(c.feed);
      if (status !== 200) throw new Error(`HTTP ${status}`);
      items = parseLivingList(body).map((it) => ({ title: it.title, date: it.date ? it.date.getTime() : null }));
    } else if (/^https:\/\/www\.i-tenpo\.com\/news\/open\/?$/.test(c.feed)) {
      const { status, body } = await fetchText(c.feed);
      if (status !== 200) throw new Error(`HTTP ${status}`);
      const $ = cheerio.load(body);
      items = $("li.c-blogList__item")
        .toArray()
        .map((li) => {
          const m = $(li).find(".c-blogList__item__info__date").text().match(/(\d{4})\.(\d{1,2})\.(\d{1,2})/);
          return { title: $(li).find(".c-blogList__item__ttl").text().trim(), date: m ? Date.parse(`${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}T12:00:00+09:00`) : null };
        });
    } else {
      items = await readFeed(c.feed);
    }
    const now = Date.now();
    const dated = items.filter((i) => i.date !== null).sort((a, b) => b.date! - a.date!);
    const newest = dated[0]?.date ?? null;
    c.newest = newest ? new Date(newest).toISOString().slice(0, 10) : null;
    c.recent30 = dated.filter((i) => now - i.date! <= 30 * DAY).length;
    c.openingHits = items.filter((i) => (i.date === null || now - i.date <= 90 * DAY) && OPEN_RE.test(i.title)).length;
    c.sample = (dated.length ? dated : items).slice(0, 3).map((i) => i.title.slice(0, 50));
    const age = newest ? (now - newest) / DAY : Infinity;
    c.status = age <= 45 ? "更新中" : age <= 180 ? "更新が少ない" : "止まっている";
  } catch (e) {
    c.status = "読めない";
    c.error = (e as Error).message.slice(0, 80);
  }
}

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>, label: string) {
  let next = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, n) }, async () => {
      while (next < items.length) {
        const x = items[next++];
        await fn(x);
        done++;
        if (done % 20 === 0) console.log(`  ${label}: ${done}/${items.length}`);
      }
    }),
  );
}

async function main() {
  const registered = existsSync(P.config("sources.json")) ? (JSON.parse(readFileSync(P.config("sources.json"), "utf8")) as Array<{ url: string; rss_url: string }>) : [];
  const seen = new Set(registered.flatMap((s) => [norm(s.rss_url), norm(s.url)]));
  const cands: Cand[] = [];
  const push = (c: Omit<Cand, "id">) => {
    if (seen.has(norm(c.feed)) || seen.has(norm(c.site))) return;
    seen.add(norm(c.feed));
    seen.add(norm(c.site));
    cands.push({ ...c, id: "" });
  };

  const known = JSON.parse(readFileSync(P.masters("known-sources.json"), "utf8")).sources as Array<{ name: string; url: string; rss_url: string; source_type: string; pref: string; city: string | null; enabled: boolean }>;
  const minkei = JSON.parse(readFileSync(P.masters("minkei-editions.json"), "utf8")).editions as Array<{ name: string; host: string; prefs: string[]; cities: string[] }>;
  const living = JSON.parse(readFileSync(P.masters("living-editions.json"), "utf8")).editions as Array<{ slug: string; label: string; area: string; prefs: string[] }>;
  console.log("号外NET の地域版一覧を読んでいます…");
  const goguy = await goguynetEditions().catch(() => ({}) as Record<string, Array<{ host: string; label: string }>>);

  for (const part of area!.areas) {
    const pref = part.pref;
    console.log(`\n■ ${pref}${part.cities.length ? `（${part.cities.join("、")}）` : ""}`);
    // 1. 確認済み（本番で使っている情報源）
    for (const s of known.filter((k) => k.pref === pref && k.enabled !== false)) {
      if (!relevant(part, s.city ? [s.city] : [])) continue;
      push({ group: "確認済み（本番で使用中）", name: s.name, site: s.url, feed: s.rss_url, type: s.source_type, pref, city: s.city });
    }
    // 2. 号外NET
    for (const g of goguy[pref] ?? []) {
      const cities = citiesIn(g.label, pref);
      if (!relevant(part, cities)) continue;
      push({ group: "号外NET", name: `号外NET ${g.label}`, site: `https://${g.host}/`, feed: `https://${g.host}/category/cat_openclose/feed/`, type: "号外NET", pref, city: oneCity(cities) });
    }
    // 3. みんなの経済新聞
    for (const e of minkei.filter((m) => m.prefs.includes(pref))) {
      if (!relevant(part, e.cities)) continue;
      push({ group: "みんなの経済新聞", name: e.name, site: `https://${e.host}/`, feed: `https://${e.host}/rss.xml`, type: "経済新聞", pref, city: oneCity(e.cities) });
    }
    // 4. リビングWeb
    for (const l of living.filter((x) => x.prefs.includes(pref))) {
      push({ group: "リビングWeb", name: `リビングWeb ${l.label} 開店・閉店`, site: `https://mrs.living.jp/${l.slug}/newopen/`, feed: `https://mrs.living.jp/${l.slug}/newopen/`, type: "独立系ブログ", pref, city: null, note: l.area });
    }
    // 6. 全国版
    push({ group: "全国版", name: "メシナビ", site: "https://meshinavi.jp/", feed: "https://meshinavi.jp/open-close/feed/", type: "独立系ブログ", pref, city: null, note: "飲食店の開店・閉店専門（全国）。対象の地域の記事だけ取り込まれる" });
    if (ITENPO_PREFS.includes(pref)) {
      push({ group: "全国版", name: "居抜き店舗.com OPEN情報", site: "https://www.i-tenpo.com/news/open", feed: "https://www.i-tenpo.com/news/open", type: "独立系ブログ", pref, city: null, note: "居抜き物件で開業した店（ほぼ1都3県）。専用の読み取りで業態から飲食店だけ拾う" });
    }
    // 5. 地域メディア名鑑
    if (!NO_DIRECTORY) {
      console.log("  地域メディア名鑑を読んでいます…");
      const entries = await directoryEntries(pref).catch(() => []);
      const wanted = entries.filter((e) => !e.region || relevant(part, citiesIn(e.region, pref)));
      console.log(`  名鑑 ${entries.length} 件のうち地域に関係あるもの ${wanted.length} 件のサイトとフィードを確かめます`);
      const found: Omit<Cand, "id">[] = [];
      await pool(
        wanted,
        CONCURRENCY,
        async (e) => {
          try {
            const info = await directorySite(e.entry);
            if (!info) return;
            const cities = citiesIn(info.region || e.region, pref);
            if (!relevant(part, cities)) return;
            if (seen.has(norm(info.site))) return;
            const feed = await discoverFeed(info.site);
            found.push({ group: "地域メディア名鑑", name: e.name, site: info.site, feed: feed ?? "", type: "独立系ブログ", pref, city: oneCity(cities), note: info.region || e.region, ...(feed ? {} : { status: "フィードなし" }) });
          } catch {
            // 読めない名鑑ページは飛ばす
          }
        },
        "名鑑",
      );
      for (const f of found) {
        if (f.feed) push(f);
        else cands.push({ ...f, id: "" });
      }
    }
  }

  console.log(`\n候補 ${cands.length} 件の更新状況を確かめています…`);
  await pool(
    cands.filter((c) => c.feed),
    CONCURRENCY,
    inspect,
    "確認",
  );

  const rank = (c: Cand) => (c.status === "更新中" ? (c.openingHits ?? 0) > 0 ? 0 : 1 : c.status === "更新が少ない" ? 2 : c.status === "止まっている" ? 3 : 4);
  cands.sort((a, b) => rank(a) - rank(b) || (b.openingHits ?? 0) - (a.openingHits ?? 0) || (b.recent30 ?? 0) - (a.recent30 ?? 0));
  cands.forEach((c, i) => (c.id = `c${i + 1}`));

  mkdirSync(P.work(""), { recursive: true });
  writeFileSync(P.work("candidates.json"), JSON.stringify(cands, null, 2));

  const sections: Array<[string, (c: Cand) => boolean]> = [
    ["すぐ使えそう（更新中・開店らしい見出しあり）", (c) => rank(c) === 0],
    ["更新中だが、開店らしい見出しが見当たらない（中身を見て判断）", (c) => rank(c) === 1],
    ["更新が少ない（45〜180日）", (c) => rank(c) === 2],
    ["止まっている（180日以上）", (c) => rank(c) === 3],
    ["読めない・フィードが見つからない", (c) => rank(c) === 4],
  ];
  const md: string[] = [
    `# 情報源の候補（${area!.name}）`,
    "",
    `作成: ${new Date().toLocaleString("ja-JP")}　／　候補 ${cands.length} 件`,
    "",
    "- 「開店らしい見出し」は直近90日の見出しに 開店/オープン/新店/開業/移転 などがある数（目安）。",
    "- 試し読み: `node tools/check-source.mjs --candidate c3`　／　まとめて登録: `node tools/sources.mjs add-candidates c1,c3,c5`",
    "",
  ];
  for (const [title, f] of sections) {
    const list = cands.filter(f);
    if (!list.length) continue;
    md.push(`## ${title}（${list.length}件）`, "", "| ID | 名前 | 種類 | 地域 | 最新 | 30日の記事 | 開店らしい見出し | 最近の見出し | フィード |", "|---|---|---|---|---|---|---|---|---|");
    for (const c of list) {
      md.push(
        `| ${c.id} | ${c.name} | ${c.group} | ${c.pref}${c.city ?? ""}${c.note ? `（${c.note.slice(0, 30)}）` : ""} | ${c.newest ?? "—"} | ${c.recent30 ?? "—"} | ${c.openingHits ?? "—"} | ${(c.sample ?? []).join(" ／ ").replace(/\|/g, "｜")} | ${c.feed || c.error || "—"} |`,
      );
    }
    md.push("");
  }
  writeFileSync(P.work("candidates.md"), md.join("\n"));
  for (const [title, f] of sections) console.log(`${title}: ${cands.filter(f).length} 件`);
  console.log(`\n結果: work/candidates.md（読む用）／ work/candidates.json`);
}

main()
  .catch((e) => {
    console.error("候補さがしを中断しました:", e);
    process.exitCode = 1;
  })
  .finally(() => setTimeout(() => process.exit(), 100));
