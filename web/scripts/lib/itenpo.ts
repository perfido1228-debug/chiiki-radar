// 居抜き店舗.com「OPEN情報」の読み取り（https://www.i-tenpo.com/news/open）。
// 居抜き物件で開業した飲食店の一覧で、全部が飲食店の開業。RSS が無いので、
// 一覧ページ（?page=N）と記事ページの表（開店日・店舗名・業態・最寄駅）から直接読む。
// 記事に住所は無いが、埋め込みの地図の中心が店の位置なので、そこから市区町村を割り出す（HeartRails Geo API・無料）。
import * as cheerio from "cheerio";
import type { Analysis, StoreDraft } from "./extract";
import {
  extractCity,
  extractGenre,
  extractOpenDate,
  isChainStore,
  jstDateString,
  normalizeStoreName,
  normalizeText,
  PREFS,
  type Pref,
} from "./normalize";

const ORIGIN = "https://www.i-tenpo.com";
const VERDICT = { ok: true, reason: "居抜き店舗.com の開業情報" };

export function isItenpoList(url: string): boolean {
  return /^https:\/\/www\.i-tenpo\.com\/news\/open\/?$/.test(url);
}

export function itenpoPageUrl(listUrl: string, page: number): string {
  return `${listUrl.replace(/\/$/, "")}?page=${page}`;
}

export type ItenpoListItem = { link: string; title: string; date: Date | null };

// 一覧ページ → 記事のURL・見出し（「OPEN 店名（○○駅）」）・投稿日
export function parseItenpoList(html: string): ItenpoListItem[] {
  const $ = cheerio.load(html);
  const items: ItenpoListItem[] = [];
  $("li.c-blogList__item").each((_, li) => {
    const href = $(li).find("[href^='/news/open/']").first().attr("href") ?? "";
    if (!/^\/news\/open\/\d+$/.test(href)) return;
    const title = $(li).find(".c-blogList__item__ttl").text().replace(/\s+/g, " ").trim();
    const m = $(li).find(".c-blogList__item__info__date").text().match(/(\d{4})\.(\d{1,2})\.(\d{1,2})/);
    // 投稿日は日付だけなので、その日の正午（日本時間）として扱う
    const date = m ? new Date(`${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}T12:00:00+09:00`) : null;
    items.push({ link: ORIGIN + href, title, date });
  });
  return items;
}

export type ItenpoDetail = {
  headline: string;
  // 表の項目（開店日・店舗名・業態・最寄駅・徒歩・営業時間）
  fields: Record<string, string>;
  lat: number | null;
  lon: number | null;
  image: string | null;
};

export function parseItenpoDetail(html: string): ItenpoDetail {
  const $ = cheerio.load(html);
  const $c = $(".p-blogDetail__content").first();
  const fields: Record<string, string> = {};
  $c.find("table tr").each((_, tr) => {
    const key = $(tr).find("th").first().text().replace(/\s+/g, "");
    const val = $(tr).find("td").first().text().replace(/\s+/g, " ").trim();
    if (key && val) fields[key] = val;
  });
  // 埋め込みの Google マップ「…!2d{経度}!3d{緯度}…」が店の位置
  const map = $c.find("iframe[src*='google.com/maps']").attr("src") ?? "";
  const ll = map.match(/!2d(-?\d+(?:\.\d+)?)!3d(-?\d+(?:\.\d+)?)/);
  return {
    headline: $c.find("h2").first().text().replace(/\s+/g, " ").trim(),
    fields,
    lat: ll ? Number(ll[2]) : null,
    lon: ll ? Number(ll[1]) : null,
    image: $c.find("img").first().attr("src") ?? null,
  };
}

// 緯度経度 → 都府県・市区町村（HeartRails Geo API）。該当なしは null、通信の失敗は例外（次回の巡回で読み直す）
async function placeOf(lat: number, lon: number): Promise<{ pref: string; city: string } | null> {
  const res = await fetch(`https://geoapi.heartrails.com/api/json?method=searchByGeoLocation&x=${lon}&y=${lat}`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`位置の問い合わせに失敗（HTTP ${res.status}）`);
  const json = (await res.json()) as { response?: { location?: Array<{ prefecture?: string; city?: string }> } };
  const loc = json.response?.location?.[0];
  return loc?.prefecture && loc.city ? { pref: loc.prefecture, city: loc.city } : null;
}

export type ItenpoAnalysis = { analysis: Analysis; content: string; thumbnail: string | null };

// 記事ページ → 店の候補（クロールの analyzeArticle に当たる処理）
export async function analyzeItenpo(html: string, publishedAt: Date): Promise<ItenpoAnalysis> {
  const d = parseItenpoDetail(html);
  const f = d.fields;
  const content = [d.headline, ...Object.entries(f).map(([k, v]) => `${k}：${v}`)].filter(Boolean).join("\n");
  const fail = (reason: string): ItenpoAnalysis => ({ analysis: { ok: false, reason, verdict: VERDICT }, content, thumbnail: d.image });

  const name = normalizeText(f["店舗名"] ?? "").replace(/\s+/g, " ").trim();
  if (!name) return fail("店名を読み取れない");
  if (isChainStore(name)) return fail("大手チェーン");
  if (d.lat === null || d.lon === null) return fail("市区町村を特定できない（地図なし）");

  const place = await placeOf(d.lat, d.lon);
  const pref = PREFS.find((p) => p === place?.pref) as Pref | undefined;
  if (!place || !pref) return fail("対象エリア外");
  const city = extractCity(`${place.pref}${place.city}`, pref);
  if (!city) return fail("市区町村を特定できない");

  const station = (f["最寄駅"] ?? "").replace(/\s+/g, "");
  const draft: StoreDraft = {
    name,
    name_normalized: normalizeStoreName(name),
    addr: null,
    addr_normalized: null,
    pref,
    city,
    tel: null,
    tel_normalized: null,
    genre: extractGenre(f["業態"] ?? "", d.headline, name),
    nearest_station: station ? (station.endsWith("駅") ? station : `${station}駅`) : null,
    open_date: f["開店日"] ? extractOpenDate(`開店日：${f["開店日"]}`, publishedAt) : null,
    listed_date: jstDateString(publishedAt),
  };
  return { analysis: { ok: true, draft, verdict: VERDICT }, content, thumbnail: d.image };
}
