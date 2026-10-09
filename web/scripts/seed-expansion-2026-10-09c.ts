import { sb } from "./lib/supabase";

// 2026-10-09 収集網 追加拡張(第6弾): 名鑑の未確認分487件の全件確認＋Web検索で見つけた首都圏の14件。
// いずれも未登録・フィード生存・直近30日に飲食の開店記事が出ていることを確認済み（ユーザー承認: 首都圏の多いほうの14件）。
// - メシナビ: 飲食の開店・閉店専門（全国）。対象外の都道府県は読み取りの「対象エリア外」で除く。トップの /feed/ は空なので開店閉店のフィードを使う
// - 麺好い（めんこい）ブログ: 見出しに開店の語が無い → crawl.ts の SOURCE_RULES で本文と記事の分類（「ラーメン/新宿区」）から読む
// - 横浜・神奈川ローカルNET: 見出し末尾の「｜場所・メニューまとめ」は normalize.ts で外して読む
type Seed = {
  name: string; url: string; rss_url: string;
  source_type: string; pref: string; city: string | null; enabled: boolean;
};
const S = (name: string, url: string, rss_url: string, pref: string, city: string | null): Seed =>
  ({ name, url, rss_url, source_type: "独立系ブログ", pref, city, enabled: true });

const SOURCES: Seed[] = [
  // ===== 広域 =====
  S("メシナビ", "https://meshinavi.jp/", "https://meshinavi.jp/open-close/feed/", "東京都", null),
  S("hibana", "https://biz-hibana.com/", "https://biz-hibana.com/feed/", "東京都", null),
  S("麺好い（めんこい）ブログ", "https://ikemen3.blog.jp/", "https://ikemen3.blog.jp/index.rdf", "東京都", null),
  // ===== 東京 =====
  S("シブヤ経済新聞", "https://www.shibukei.com/", "https://www.shibukei.com/rss.xml", "東京都", "渋谷区"),
  S("吉祥寺ファンページ", "https://kichifan.com/", "https://kichifan.com/feed/", "東京都", null),
  S("シブきち", "https://shibukichi.net/", "https://shibukichi.net/feed/", "東京都", null),
  S("竹の塚情報局たけトピ", "https://takenotsuka-topic.com/", "https://takenotsuka-topic.com/feed", "東京都", "足立区"),
  // 町田市と相模原市（都県をまたぐので市区町村は記事ごとに決める）
  S("まちさが", "https://machisaga.jp/", "https://machisaga.jp/feed/", "東京都", null),
  // ===== 神奈川 =====
  S("横浜・神奈川ローカルNET", "https://yokohama-localu.com/", "https://yokohama-localu.com/feed/", "神奈川県", null),
  S("うちの街 都筑！", "https://uchino-at.jugem.jp/", "https://uchino-at.jugem.jp/?mode=rss", "神奈川県", "横浜市都筑区"),
  S("綱島ニュース", "https://tsunashima.love/", "https://tsunashima.love/feed/", "神奈川県", "横浜市港北区"),
  S("厚木らぼ", "https://atsugi-lab.com/", "https://atsugi-lab.com/feed/", "神奈川県", null),
  // ===== 埼玉 =====
  S("さいたま浦和大宮グルメなび（浦和裏日記）", "https://saitama-omiya-urawa.blog.jp/", "https://saitama-omiya-urawa.blog.jp/index.rdf", "埼玉県", "さいたま市"),
  S("日進大宮なび", "https://newnissin.com/", "https://newnissin.com/category/news/open-close/feed/", "埼玉県", "さいたま市"),
];

async function main() {
  console.log(`Seeding ${SOURCES.length} sources (metro-area candidates)...`);
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
