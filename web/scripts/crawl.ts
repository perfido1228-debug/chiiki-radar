// 地域密着レーダー: 情報源（RSS）を巡回して新規開店の記事を取り込む。
//
// 使い方:
//   npx tsx scripts/crawl.ts                 … 有効な全情報源を巡回（GitHub Actions から毎時実行）
//   npx tsx scripts/crawl.ts <キーワード>      … 名前/URLに一致する情報源だけ巡回（新規追加の確認・遡り取込用）
//   npx tsx scripts/crawl.ts --dry-run        … DBに書き込まず、何を取り込むかだけ表示する
//   オプション: --concurrency=8（同時に巡回する数） --max-age-days=120（これより古い記事は取り込まない）
import Parser from "rss-parser";
import * as cheerio from "cheerio";
import { appendFileSync } from "fs";
import { sb } from "./lib/supabase";
import { analyzeArticle, type SourceInfo, type StoreDraft } from "./lib/extract";
import { classifyArticle } from "./lib/normalize";
import { findExistingStore } from "./lib/dedupe";

type SourceRow = SourceInfo & {
  url: string;
  rss_url: string;
  enabled: boolean;
  last_crawled_at: string | null;
};

type FeedItem = { link: string; title: string; html: string; date: Date | null };

type SourceResult = {
  source: SourceRow;
  ok: boolean;
  error?: string;
  items: number;
  pages: number;
  newestItem: Date | null;
  added: number;
  merged: number;
  rejected: number;
  skipped: number;
  newStores: string[];
};

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const KEYWORD = args.find((a) => !a.startsWith("--"));
const CONCURRENCY = Number(args.find((a) => a.startsWith("--concurrency="))?.split("=")[1] ?? 8);
const MAX_AGE_DAYS = Number(args.find((a) => a.startsWith("--max-age-days="))?.split("=")[1] ?? 120);
const MAX_PAGES = 4;
const UA = "Mozilla/5.0 ChiikiRadar/1.0 (+https://github.com/perfido1228-debug/chiiki-radar)";

const parser = new Parser({
  timeout: 20000,
  headers: { "User-Agent": UA },
  customFields: {
    item: [
      ["content:encoded", "contentEncoded"],
      ["media:thumbnail", "mediaThumbnail"],
    ],
  },
});

function stripHtml(html: string): string {
  if (!html) return "";
  const $ = cheerio.load(html);
  $("script, style, noscript, template").remove();
  return $.text().replace(/\s+/g, " ").trim();
}

function firstImage(html: string): string | null {
  if (!html) return null;
  return cheerio.load(html)("img").first().attr("src") ?? null;
}

async function fetchText(url: string, timeoutMs: number): Promise<{ status: number; body: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: controller.signal, redirect: "follow" });
    const body = res.ok ? await res.text() : "";
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

// フィードを読む。rss-parser が失敗するサイト（未エスケープの「&」、UA拒否など）は取得し直して整えてから読む
async function parseFeed(url: string): Promise<FeedItem[]> {
  let feed: Awaited<ReturnType<typeof parser.parseURL>>;
  try {
    feed = await parser.parseURL(url);
  } catch {
    const { status, body } = await fetchText(url, 20000);
    if (status < 200 || status >= 300) throw new Error(`HTTP ${status}`);
    const sanitized = body.replace(/&(?!(?:[a-zA-Z][a-zA-Z0-9]*|#\d+|#x[0-9a-fA-F]+);)/g, "&amp;");
    feed = await parser.parseString(sanitized);
  }
  return (feed.items ?? [])
    .filter((it) => it.link)
    .map((it) => {
      const raw = it as unknown as Record<string, unknown>;
      const iso = (it.isoDate as string | undefined) ?? (it.pubDate as string | undefined);
      const date = iso ? new Date(iso) : null;
      return {
        link: String(it.link).trim(),
        title: String(it.title ?? "").trim(),
        html: String(raw.contentEncoded ?? it.content ?? ""),
        date: date && !Number.isNaN(date.getTime()) ? date : null,
      };
    });
}

// WordPress のフィードは ?paged=2 で過去の記事を遡れる（巡回が止まっていた間の記事を取り戻すため）
function pagedUrl(rssUrl: string, page: number): string | null {
  if (!/\/feed\/?($|\?)|[?&]feed=(?:rss2|atom)/.test(rssUrl)) return null;
  return rssUrl + (rssUrl.includes("?") ? "&" : "?") + `paged=${page}`;
}

// 記事ページの本文（関連記事・SNSボタン・コメント欄などを除く）とアイキャッチ画像
async function fetchArticlePage(url: string): Promise<{ text: string; thumbnail: string | null }> {
  try {
    const { status, body } = await fetchText(url, 15000);
    if (status < 200 || status >= 300 || !body) return { text: "", thumbnail: null };
    const $ = cheerio.load(body);
    const og = $('meta[property="og:image"]').attr("content") ?? null;
    $(
      "script, style, noscript, template, nav, header, footer, aside, iframe, form, .sidebar, .widget, " +
        "[class*=related], [id*=related], .yarpp, [class*=share], [class*=sns], [class*=breadcrumb], " +
        "[class*=pagination], [class*=comment], [id*=comment], [class*=ranking], [class*=popular], [class*=recommend]",
    ).remove();
    const selectors = ['[itemprop="articleBody"]', ".entry-content", ".post-content", ".article-body", ".single-content", ".post-body", ".entry-body", "article", "main"];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let $body: cheerio.Cheerio<any> = $("body");
    for (const sel of selectors) {
      const found = $(sel).first();
      if (found.length && found.text().trim().length > 200) {
        $body = found;
        break;
      }
    }
    const text = $body.text().replace(/\s+/g, " ").trim().slice(0, 10000);
    return { text, thumbnail: og ?? $body.find("img").first().attr("src") ?? null };
  } catch {
    return { text: "", thumbnail: null };
  }
}

// すでに取り込んだ記事のURL（まとめて問い合わせる）
async function existingUrls(urls: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (let i = 0; i < urls.length; i += 40) {
    const chunk = urls.slice(i, i + 40);
    const { data, error } = await sb.from("articles").select("article_url").in("article_url", chunk);
    if (error) throw new Error(`articles 検索に失敗: ${error.message}`);
    for (const r of data ?? []) found.add(r.article_url as string);
  }
  return found;
}

// 店の登録・統合は同時に行うと二重登録になりうるので、1件ずつ順番に処理する
let storeLock: Promise<unknown> = Promise.resolve();
function withStoreLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = storeLock.then(fn, fn);
  storeLock = run.catch(() => undefined);
  return run;
}

// 後から出た記事で分かった情報を、既存の店に足す（空欄を埋める／オープン日の更新）
function fillFromDraft(existing: Record<string, unknown>, d: StoreDraft, title: string): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (!existing.addr && d.addr) {
    patch.addr = d.addr;
    patch.addr_normalized = d.addr_normalized;
  }
  if (!existing.tel && d.tel) {
    patch.tel = d.tel;
    patch.tel_normalized = d.tel_normalized;
  }
  if (!existing.genre && d.genre) patch.genre = d.genre;
  if (!existing.nearest_station && d.nearest_station) patch.nearest_station = d.nearest_station;
  if (d.open_date && (!existing.open_date || /延期|変更|判明|決定|決まった/.test(title)) && existing.open_date !== d.open_date) {
    patch.open_date = d.open_date;
  }
  return patch;
}

async function saveStore(articleId: number, d: StoreDraft, thumbnail: string | null, title: string): Promise<"added" | "merged"> {
  return withStoreLock(async () => {
    const match = await findExistingStore(d);
    let storeId: number;
    let result: "added" | "merged";
    if (match.type === "hard_match") {
      storeId = match.storeId;
      result = "merged";
      const { data: cur } = await sb.from("stores").select("addr, tel, genre, nearest_station, open_date").eq("id", storeId).single();
      const patch = cur ? fillFromDraft(cur, d, title) : {};
      if (Object.keys(patch).length) {
        const { error } = await sb.from("stores").update(patch).eq("id", storeId);
        if (error) throw new Error(`stores 更新に失敗: ${error.message}`);
      }
    } else {
      const { data, error } = await sb
        .from("stores")
        .insert({
          ...d,
          thumbnail_url: thumbnail,
          duplicate_flag: match.type === "soft_match",
          duplicate_of_id: match.type === "soft_match" ? match.storeId : null,
        })
        .select("id")
        .single();
      if (error || !data) throw new Error(`stores 登録に失敗: ${error?.message}`);
      storeId = data.id;
      result = "added";
    }
    const { error: linkErr } = await sb.from("store_articles").upsert({ store_id: storeId, article_id: articleId });
    if (linkErr) throw new Error(`store_articles 登録に失敗: ${linkErr.message}`);
    return result;
  });
}

async function crawlSource(src: SourceRow): Promise<SourceResult> {
  const r: SourceResult = { source: src, ok: false, items: 0, pages: 0, newestItem: null, added: 0, merged: 0, rejected: 0, skipped: 0, newStores: [] };
  const lastCrawled = src.last_crawled_at ? new Date(src.last_crawled_at) : null;
  const minDate = new Date(Date.now() - MAX_AGE_DAYS * 86400000);

  let items: FeedItem[];
  try {
    items = await parseFeed(src.rss_url);
    r.pages = 1;
  } catch (e) {
    r.error = (e as Error).message.slice(0, 160);
    return r;
  }

  // 巡回が止まっていた間に記事が流れてしまっていないか（1ページ目の一番古い記事が前回の巡回より新しい）
  // その場合は2ページ目以降も遡る
  if (lastCrawled) {
    const seen = new Set(items.map((it) => it.link));
    for (let page = 2; page <= MAX_PAGES; page++) {
      const dated = items.filter((it) => it.date);
      const oldest = dated.length ? Math.min(...dated.map((it) => it.date!.getTime())) : null;
      if (oldest === null || oldest <= lastCrawled.getTime() || oldest < minDate.getTime()) break;
      const url = pagedUrl(src.rss_url, page);
      if (!url) break;
      let more: FeedItem[];
      try {
        more = await parseFeed(url);
      } catch {
        break;
      }
      const fresh = more.filter((it) => !seen.has(it.link));
      if (!fresh.length) break;
      fresh.forEach((it) => seen.add(it.link));
      items = items.concat(fresh);
      r.pages = page;
    }
  }

  r.items = items.length;
  r.newestItem = items.reduce<Date | null>((acc, it) => (it.date && (!acc || it.date > acc) ? it.date : acc), null);

  const recent = items.filter((it) => !it.date || it.date >= minDate);
  r.skipped += items.length - recent.length;
  let known: Set<string>;
  try {
    known = await existingUrls(recent.map((it) => it.link));
  } catch (e) {
    r.error = (e as Error).message.slice(0, 160);
    return r;
  }

  for (const it of recent) {
    if (known.has(it.link)) {
      r.skipped++;
      continue;
    }
    const rssText = stripHtml(it.html);
    let verdict = classifyArticle(it.title, rssText);
    let page: { text: string; thumbnail: string | null } | null = null;

    // RSSに本文の抜粋しかなく、見出しだけでは業種が分からない新着記事は、記事ページを読んで判断し直す
    const isNew = !lastCrawled || !it.date || it.date.getTime() > lastCrawled.getTime() - 2 * 3600 * 1000;
    if (!verdict.ok && isNew && rssText.length < 400 && /飲食の語なし|本文冒頭が飲食以外/.test(verdict.reason)) {
      page = await fetchArticlePage(it.link);
      if (page.text) verdict = classifyArticle(it.title, page.text);
    }
    if (!verdict.ok) {
      r.rejected++;
      continue;
    }

    page ??= await fetchArticlePage(it.link);
    const publishedAt = it.date ?? new Date();
    const analysis = analyzeArticle({ title: it.title, rssText, pageText: page.text, publishedAt, source: src });
    const thumbnail = firstImage(it.html) ?? page.thumbnail;
    const content = (page.text && page.text.length > rssText.length ? page.text : rssText).slice(0, 5000);

    if (DRY_RUN) {
      if (analysis.ok) {
        r.added++;
        r.newStores.push(`${analysis.draft.name}（${analysis.draft.city}）`);
        console.log(`  [取込候補] ${it.title}\n     → ${analysis.draft.name} / ${analysis.draft.pref}${analysis.draft.city} / ${analysis.draft.genre ?? "-"} / OPEN ${analysis.draft.open_date ?? "-"} / ${analysis.draft.addr ?? "住所なし"} / ${analysis.draft.tel ?? "電話なし"}`);
      } else {
        r.skipped++;
        console.log(`  [記事のみ] ${it.title} … ${analysis.reason}`);
      }
      continue;
    }

    // 記事は店が作れなかった場合も保存する（次回以降に同じ記事を読み直さないため）
    const { data: art, error: artErr } = await sb
      .from("articles")
      .insert({
        source_id: src.id,
        article_url: it.link,
        title: it.title,
        content,
        thumbnail_url: thumbnail,
        published_at: publishedAt.toISOString(),
        parsed: true,
      })
      .select("id")
      .single();
    if (artErr || !art) {
      // 同じ記事を別の情報源が同時に登録した場合など
      r.skipped++;
      console.error(`  記事の登録に失敗: ${artErr?.message}`);
      continue;
    }
    if (!analysis.ok) {
      r.skipped++;
      continue;
    }
    const res = await saveStore(art.id, analysis.draft, thumbnail, it.title);
    if (res === "added") {
      r.added++;
      r.newStores.push(`${analysis.draft.name}（${analysis.draft.city}）`);
    } else r.merged++;
  }

  if (!DRY_RUN) {
    const { error } = await sb.from("sources").update({ last_crawled_at: new Date().toISOString() }).eq("id", src.id);
    if (error) console.error(`  最終巡回日時の更新に失敗: ${error.message}`);
  }
  r.ok = true;
  return r;
}

async function loadSources(): Promise<SourceRow[]> {
  const rows: SourceRow[] = [];
  for (let from = 0; ; from += 1000) {
    let q = sb.from("sources").select("*").eq("enabled", true).order("id").range(from, from + 999);
    if (KEYWORD) q = q.or(`name.ilike.%${KEYWORD}%,url.ilike.%${KEYWORD}%`);
    const { data, error } = await q;
    if (error) throw new Error(`情報源の読み込みに失敗: ${error.message}`);
    rows.push(...((data ?? []) as SourceRow[]));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

function writeSummary(results: SourceResult[], ms: number) {
  const failed = results.filter((r) => !r.ok);
  const added = results.reduce((a, r) => a + r.added, 0);
  const merged = results.reduce((a, r) => a + r.merged, 0);
  const lines = [
    `## 地域密着レーダー 巡回結果${DRY_RUN ? "（試行・DB書き込みなし）" : ""}`,
    "",
    `- 情報源: ${results.length} 件（取得失敗 ${failed.length} 件）`,
    `- 新しい店: ${added} 件 / 既存の店に記事を追加: ${merged} 件`,
    `- 所要時間: ${Math.round(ms / 1000)} 秒`,
    "",
  ];
  if (failed.length) {
    lines.push("### 取得に失敗した情報源", "", "| 情報源 | フィード | エラー |", "|---|---|---|");
    for (const r of failed) lines.push(`| ${r.source.name} | ${r.source.rss_url} | ${r.error ?? ""} |`);
    lines.push("");
  }
  const newOnes = results.flatMap((r) => r.newStores.map((s) => `- ${s} … ${r.source.name}`));
  if (newOnes.length) lines.push("### 新しく取り込んだ店", "", ...newOnes.slice(0, 200), "");
  const text = lines.join("\n");
  console.log("\n" + text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + "\n");
}

async function main() {
  const started = Date.now();
  const sources = await loadSources();
  if (sources.length === 0) {
    console.error(KEYWORD ? `「${KEYWORD}」に一致する有効な情報源がありません。` : "有効な情報源がありません。");
    return;
  }
  console.log(`情報源 ${sources.length} 件を巡回します（同時 ${CONCURRENCY} 件${DRY_RUN ? "・試行モード" : ""}）`);

  const results: SourceResult[] = [];
  let next = 0;
  async function worker() {
    while (next < sources.length) {
      const src = sources[next++];
      const r = await crawlSource(src).catch((e: Error) => ({
        source: src, ok: false, error: e.message.slice(0, 160), items: 0, pages: 0, newestItem: null,
        added: 0, merged: 0, rejected: 0, skipped: 0, newStores: [],
      } as SourceResult));
      results.push(r);
      console.log(
        r.ok
          ? `○ ${src.name}: 記事${r.items}件${r.pages > 1 ? `（${r.pages}ページ）` : ""} 新規店${r.added} 統合${r.merged} 対象外${r.rejected}`
          : `× ${src.name}: ${r.error}`,
      );
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, CONCURRENCY) }, worker));

  writeSummary(results, Date.now() - started);
  // 多くの情報源で失敗した場合（DB停止・鍵の失効など）は実行を失敗扱いにして気付けるようにする
  const failRatio = results.filter((r) => !r.ok).length / results.length;
  if (failRatio >= 0.3) {
    console.error(`取得失敗が ${Math.round(failRatio * 100)}% に達しました。`);
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error("巡回を中断しました:", e);
    process.exitCode = 1;
  })
  // 記事サイトとの接続（keep-alive）が数分残って終了が遅れるため、明示的に終える
  .finally(() => process.exit());
