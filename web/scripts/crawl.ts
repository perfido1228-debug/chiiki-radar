import Parser from "rss-parser";
import * as cheerio from "cheerio";
import { sb } from "./lib/supabase";
import {
  normalizeStoreName,
  normalizeAddress,
  normalizeTel,
  extractAddress,
  extractTel,
  extractOpenDate,
  extractGenre,
  extractStoreName,
  extractPref,
  extractCity,
  extractNearestStation,
  isFoodOpening,
  isChainStore,
  type Pref,
} from "./lib/normalize";
import { findExistingStore } from "./lib/dedupe";

type SourceRow = {
  id: number;
  name: string;
  url: string;
  rss_url: string;
  source_type: string;
  pref: string;
  city: string | null;
};

const parser = new Parser({
  customFields: {
    item: [
      ["content:encoded", "contentEncoded"],
      ["media:thumbnail", "mediaThumbnail"],
    ],
  },
});

function stripHtml(html: string): string {
  const $ = cheerio.load(html);
  return $.text().replace(/\s+/g, " ").trim();
}

function extractFirstImageUrl(html: string): string | null {
  const $ = cheerio.load(html);
  const src = $("img").first().attr("src");
  return src ?? null;
}

async function fetchArticleFullText(url: string): Promise<{ text: string; thumbnail: string | null }> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 ChiikiRadar/1.0 (+https://github.com/perfido1228-debug/chiiki-radar)" },
      signal: controller.signal,
    });
    clearTimeout(t);
    if (!res.ok) return { text: "", thumbnail: null };
    const html = await res.text();
    const $ = cheerio.load(html);
    $("script, style, nav, header, footer, aside, iframe, form, .sidebar, .widget").remove();
    const candidates = ["article", ".post-content", ".entry-content", ".post-body", ".single-content", "main"];
    let $body = $("body");
    for (const sel of candidates) {
      const found = $(sel).first();
      if (found.length && found.text().trim().length > 200) { $body = found; break; }
    }
    const text = $body.text().replace(/\s+/g, " ").trim().slice(0, 10000);
    const thumb = $body.find("img").first().attr("src") ?? $('meta[property="og:image"]').attr("content") ?? null;
    return { text, thumbnail: thumb };
  } catch {
    return { text: "", thumbnail: null };
  }
}

async function crawlSource(src: SourceRow) {
  console.log(`\n=== ${src.name} (${src.rss_url}) ===`);
  let feed;
  try {
    feed = await parser.parseURL(src.rss_url);
  } catch (e) {
    console.error(`  RSS fetch failed:`, (e as Error).message);
    return;
  }

  const items = feed.items ?? [];
  console.log(`  items: ${items.length}`);

  let added = 0, skipped = 0, merged = 0;

  for (const item of items) {
    const articleUrl = item.link;
    if (!articleUrl) { skipped++; continue; }

    const { data: existingArticle } = await sb
      .from("articles")
      .select("id")
      .eq("article_url", articleUrl)
      .maybeSingle();
    if (existingArticle) { skipped++; continue; }

    const title = (item.title ?? "").trim();
    const rssContentHtml = (item as any).contentEncoded ?? item.content ?? "";
    const rssContentText = stripHtml(rssContentHtml);
    const pubDate = item.pubDate ? new Date(item.pubDate) : new Date();
    let thumbnail = extractFirstImageUrl(rssContentHtml);

    if (!isFoodOpening(title, rssContentText)) { skipped++; continue; }
    if (isChainStore(title, rssContentText)) { skipped++; continue; }

    const full = await fetchArticleFullText(articleUrl);
    const contentText = full.text && full.text.length > rssContentText.length ? full.text : rssContentText;
    if (!thumbnail && full.thumbnail) thumbnail = full.thumbnail;

    const { data: articleIns, error: articleErr } = await sb
      .from("articles")
      .insert({
        source_id: src.id,
        article_url: articleUrl,
        title,
        content: contentText.slice(0, 5000),
        thumbnail_url: thumbnail,
        published_at: pubDate.toISOString(),
        parsed: true,
      })
      .select("id")
      .single();
    if (articleErr || !articleIns) {
      console.error(`  article insert error:`, articleErr?.message);
      continue;
    }

    const storeName = extractStoreName(title);
    const addr = extractAddress(`${title} ${contentText}`, src.pref as Pref);
    const pref = (addr ? extractPref(addr) : null) ?? (src.pref as Pref);
    const city = (addr && pref ? extractCity(addr, pref) : null) ?? src.city ?? "";
    const tel = extractTel(contentText);
    const openDate = extractOpenDate(`${title} ${contentText}`, pubDate.getFullYear());
    const genre = extractGenre(contentText, title);
    const nearestStation = extractNearestStation(`${title} ${contentText}`);

    if (!storeName || !pref || !city) { skipped++; continue; }

    const candidate = {
      name: storeName,
      name_normalized: normalizeStoreName(storeName),
      addr,
      addr_normalized: addr ? normalizeAddress(addr) : null,
      tel_normalized: normalizeTel(tel),
      pref,
      city,
    };

    const match = await findExistingStore(candidate);

    let storeId: number;
    if (match.type === "hard_match") {
      storeId = match.storeId;
      merged++;
    } else {
      const { data: storeIns, error: storeErr } = await sb
        .from("stores")
        .insert({
          name: candidate.name,
          name_normalized: candidate.name_normalized,
          addr: candidate.addr,
          addr_normalized: candidate.addr_normalized,
          pref: candidate.pref,
          city: candidate.city,
          tel,
          tel_normalized: candidate.tel_normalized,
          genre,
          nearest_station: nearestStation,
          open_date: openDate,
          listed_date: pubDate.toISOString().slice(0, 10),
          thumbnail_url: thumbnail,
          duplicate_flag: match.type === "soft_match",
          duplicate_of_id: match.type === "soft_match" ? match.storeId : null,
        })
        .select("id")
        .single();
      if (storeErr || !storeIns) {
        console.error(`  store insert error:`, storeErr?.message);
        continue;
      }
      storeId = storeIns.id;
      added++;
    }

    await sb.from("store_articles").upsert({ store_id: storeId, article_id: articleIns.id });
  }

  await sb.from("sources").update({ last_crawled_at: new Date().toISOString() }).eq("id", src.id);
  console.log(`  added=${added} merged=${merged} skipped=${skipped}`);
}

async function main() {
  const { data: sources, error } = await sb
    .from("sources")
    .select("*")
    .eq("enabled", true);
  if (error) throw error;
  if (!sources || sources.length === 0) {
    console.error("No enabled sources found. Run seed-sources.ts first.");
    return;
  }
  for (const src of sources) {
    await crawlSource(src as SourceRow);
  }
  console.log("\nAll sources crawled.");
}

main().catch(console.error);
