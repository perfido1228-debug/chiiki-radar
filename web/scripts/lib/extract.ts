// 1本の記事から「店舗の候補」を組み立てる処理。クロールとデータ修復で同じ判断をするために共通化している。
import {
  classifyArticle,
  cityFromTitleTag,
  cityMentioned,
  extractAddress,
  extractCity,
  extractGenre,
  extractNearestStation,
  extractOpenDate,
  extractPref,
  extractStoreName,
  extractTel,
  isChainStore,
  jstDateString,
  looksOutOfArea,
  nameLooksNonFood,
  normalizeAddress,
  normalizeStoreName,
  normalizeTel,
  trimBoilerplate,
  PREFS,
  type OpeningVerdict,
  type Pref,
} from "./normalize";

export type SourceInfo = {
  id: number;
  name: string;
  pref: string | null;
  city: string | null;
  source_type: string;
};

export type ArticleInput = {
  title: string;
  // RSS に載っている本文（HTML を除いたテキスト）
  rssText: string;
  // 記事ページから取った本文（取れた場合）
  pageText?: string;
  publishedAt: Date;
  source: SourceInfo;
};

export type StoreDraft = {
  name: string;
  name_normalized: string;
  addr: string | null;
  addr_normalized: string | null;
  pref: Pref;
  city: string;
  tel: string | null;
  tel_normalized: string | null;
  genre: string | null;
  nearest_station: string | null;
  open_date: string | null;
  listed_date: string;
};

export type Analysis =
  | { ok: true; draft: StoreDraft; verdict: OpeningVerdict }
  | { ok: false; reason: string; verdict?: OpeningVerdict };

function isPref(p: string | null | undefined): p is Pref {
  return !!p && (PREFS as readonly string[]).includes(p);
}

// skipClassify: 開店記事かどうかの判定を省く（取込済み記事の読み直しなど）
export function analyzeArticle(input: ArticleInput, opts: { skipClassify?: boolean } = {}): Analysis {
  const title = input.title.trim();
  const rssText = input.rssText ?? "";
  const verdict = classifyArticle(title, rssText || input.pageText || "");
  if (!opts.skipClassify && !verdict.ok) return { ok: false, reason: verdict.reason, verdict };

  const bodyRaw = input.pageText && input.pageText.length > rssText.length ? input.pageText : rssText;
  const body = trimBoilerplate(bodyRaw);
  const all = `${title} ${body}`;
  const srcPref: Pref | null = isPref(input.source.pref) ? input.source.pref : null;
  const srcCity = input.source.city ?? null;

  const name = extractStoreName(title, body);
  if (!name) return { ok: false, reason: "店名を読み取れない", verdict };
  if (isChainStore(name)) return { ok: false, reason: "大手チェーン", verdict };
  if (!opts.skipClassify && nameLooksNonFood(name)) return { ok: false, reason: "店名が飲食以外", verdict };

  // 場所の決め方: 記事中の住所 → 見出しの【市区町村】タグ → 情報源の担当地域
  let addr = extractAddress(all, srcPref ?? undefined);
  let pref: Pref | null = null;
  let city: string | null = null;
  if (addr) {
    pref = extractPref(addr);
    city = pref ? extractCity(addr, pref, srcCity) : null;
    if (!pref || !city) addr = null;
  }
  if (!city) {
    const tag = cityFromTitleTag(title, srcPref, srcCity);
    if (tag) {
      pref = tag.pref;
      city = tag.city;
    }
  }
  if (!city) {
    if (looksOutOfArea(title, body)) return { ok: false, reason: "対象エリア外", verdict };
    // 見出しの文中に市区町村名が1つだけ出てくる（「半田市に○○がオープン」等）
    // 担当地域を持たない広域の情報源では、本文の書き出しも見る
    const mention = cityMentioned(title, srcPref) ?? (srcCity ? null : cityMentioned(body.slice(0, 300), srcPref));
    if (mention) {
      pref = mention.pref;
      city = mention.city;
    } else if (srcPref && srcCity) {
      pref = srcPref;
      city = srcCity;
    }
  }
  if (!pref || !city) return { ok: false, reason: "市区町村を特定できない", verdict };

  const tel = extractTel(body);
  const draft: StoreDraft = {
    name,
    name_normalized: normalizeStoreName(name),
    addr,
    addr_normalized: addr ? normalizeAddress(addr) : null,
    pref,
    city,
    tel,
    tel_normalized: normalizeTel(tel),
    genre: extractGenre(body, title, name),
    nearest_station: extractNearestStation(all),
    open_date: extractOpenDate(all, input.publishedAt),
    listed_date: jstDateString(input.publishedAt),
  };
  return { ok: true, draft, verdict };
}
