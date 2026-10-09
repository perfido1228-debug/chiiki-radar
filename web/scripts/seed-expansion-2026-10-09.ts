import { sb } from "./lib/supabase";

// 2026-10-09 収集網 追加拡張(第4弾): 手薄エリア補強の独立系ローカルメディア7件。
// ご当地ニュース(news.gotouti.jp)の掲載サイトのうち、DB未登録かつ既存ソースが無い市区町村のものを確認。
// 全てフィード生存・直近更新・開店記事掲載を確認済み。
// 手薄だった 国立市/横浜市港北区・瀬谷区/川崎市麻生区/名古屋市 を補強。
type Seed = {
  name: string; url: string; rss_url: string;
  source_type: string; pref: string; city: string | null; enabled: boolean;
};
const S = (name: string, url: string, rss_url: string, pref: string, city: string | null): Seed =>
  ({ name, url, rss_url, source_type: "独立系ブログ", pref, city, enabled: true });

const SOURCES: Seed[] = [
  // ===== 東京（多摩）=====
  S("いいね！国立", "https://iine-kunitachi.net/", "https://iine-kunitachi.net/feed/", "東京都", "国立市"),
  // ===== 神奈川（横浜・川崎の区の空白補強）=====
  S("ツナシマニア", "https://tsunashimania.com/", "https://tsunashimania.com/feed/", "神奈川県", "横浜市港北区"),
  S("瀬谷なび", "https://seya-navi.com/", "https://seya-navi.com/feed/", "神奈川県", "横浜市瀬谷区"),
  S("新百合ヶ丘タイムズ", "https://shinyuriknow.com/", "https://shinyuriknow.com/feed/", "神奈川県", "川崎市麻生区"),
  // ===== 愛知（名古屋市）=====
  S("しょうわん", "https://sho-wan.com/", "https://sho-wan.com/feed/", "愛知県", "名古屋市昭和区"),
  S("名古屋市中川区情報2", "https://nagoyasi-nakagawakunoomise.blog.jp/", "https://nagoyasi-nakagawakunoomise.blog.jp/index.rdf", "愛知県", "名古屋市中川区"),
  S("ナゴヤトコトン", "https://nagoyato.com/", "https://nagoyato.com/feed", "愛知県", "名古屋市"),
];

async function main() {
  console.log(`Seeding ${SOURCES.length} local media sources (thin-area reinforcement)...`);
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
