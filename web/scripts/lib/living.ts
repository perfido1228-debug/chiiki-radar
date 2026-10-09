// リビングWeb「開店・閉店」の読み取り（https://mrs.living.jp/{地域版}/newopen/）。
// フィードの中身が空なので、一覧ページ（/page/N）から記事のURL・見出し・掲載日を読む。
// 記事ページは本文（#single）に店名・住所・地図があり、ほかの情報源と同じ判定・組み立てで読める（crawl.ts の SOURCE_RULES）。
import * as cheerio from "cheerio";

export function isLivingList(url: string): boolean {
  return /^https:\/\/mrs\.living\.jp\/[a-z_-]+\/newopen\/?$/.test(url);
}

export function livingPageUrl(listUrl: string, page: number): string {
  return `${listUrl.replace(/\/$/, "")}/page/${page}`;
}

export type LivingListItem = { link: string; title: string; date: Date | null };

// 一覧ページ → 記事のURL・見出し（「【開店】「店名」9月18日（金）オープン！」）・掲載日
export function parseLivingList(html: string): LivingListItem[] {
  const $ = cheerio.load(html);
  const items: LivingListItem[] = [];
  $("li.box").each((_, li) => {
    const a = $(li).find("dd.title a").first();
    const link = (a.attr("href") ?? "").replace(/\?.*$/, "");
    if (!/^https:\/\/mrs\.living\.jp\/[a-z_-]+\/newopen\/article\/\d+$/.test(link)) return;
    const title = a.text().replace(/\s+/g, " ").trim();
    const m = $(li).find(".article-list__footer").text().match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
    // 掲載日は日付だけなので、その日の正午（日本時間）として扱う
    const date = m ? new Date(`${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}T12:00:00+09:00`) : null;
    if (title) items.push({ link, title, date });
  });
  return items;
}
