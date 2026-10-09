import { sb } from "./lib/supabase";

// 2026-10-09 収集網 追加拡張(第5弾): ユーザーが見つけた未登録の3件。
// 地域メディアの名鑑に載っていない「個人の開店ブログ」と「居抜き物件会社の開業一覧」。
// - 練馬・桜台情報局: ほぼ全記事が練馬区の開店。本文に業種が無いので記事の分類も読む（crawl.ts の CATEGORY_AS_TEXT）
// - ここは何が出来るんだろう？: 相模原市の開店・閉店を毎日（病院・薬局も載るので飲食だけ拾う）。
//   本文に X の埋め込みがあり、フィードの区切りが壊れる → crawl.ts の parseFeed で取り除いて読む
// - 居抜き店舗.com OPEN情報: 全部が飲食店の開業・ほぼ1都3県。RSS が無いので専用の読み取り（lib/itenpo.ts）
type Seed = {
  name: string; url: string; rss_url: string;
  source_type: string; pref: string; city: string | null; enabled: boolean;
};
const S = (name: string, url: string, rss_url: string, pref: string, city: string | null): Seed =>
  ({ name, url, rss_url, source_type: "独立系ブログ", pref, city, enabled: true });

const SOURCES: Seed[] = [
  S("練馬・桜台情報局", "https://s-nerima.jp/", "https://s-nerima.jp/feed", "東京都", "練馬区"),
  S("ここは何が出来るんだろう？（相模原）", "https://sagamiharahashimoto.seesaa.net/", "https://sagamiharahashimoto.seesaa.net/index.rdf", "神奈川県", "相模原市"),
  // 担当地域は1都3県が中心（店の場所は記事ごとに地図から決める）
  S("居抜き店舗.com OPEN情報", "https://www.i-tenpo.com/news/open", "https://www.i-tenpo.com/news/open", "東京都", null),
];

async function main() {
  console.log(`Seeding ${SOURCES.length} sources (user-found blogs + restaurant-property openings)...`);
  let ok = 0, fail = 0;
  for (const s of SOURCES) {
    const { error } = await sb.from("sources").upsert(s, { onConflict: "url" });
    if (error) { console.error(`[${s.name}] ${error.message}`); fail++; }
    else ok++;
  }
  const { count } = await sb.from("sources").select("*", { count: "exact", head: true }).eq("enabled", true);
  console.log(`Done. ok=${ok} fail=${fail} / total enabled sources now: ${count}`);
}
main().catch(console.error);
