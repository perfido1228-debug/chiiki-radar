import { sb } from "./lib/supabase";

// 2026-07-16 収集網 追加拡張(第3弾): 手薄エリア補強＋別ルート発掘の独立系ローカルメディア14件。
// toraeru等のローカルメディアまとめ＋カバーが薄い市区町村の個別検索で発掘。
// 全てDB未登録・フィード生存・直近更新・開店記事掲載を確認済み。
// 手薄だった 京都/大阪南部/埼玉北部/多摩西部/愛知非名古屋 を重点補強。
type Seed = {
  name: string; url: string; rss_url: string;
  source_type: string; pref: string; city: string | null; enabled: boolean;
};
const S = (name: string, url: string, rss_url: string, pref: string, city: string | null): Seed =>
  ({ name, url, rss_url, source_type: "独立系ブログ", pref, city, enabled: true });

const SOURCES: Seed[] = [
  // ===== 東京（多摩西部・下町・城南の空白補強）=====
  S("荒川区のはなし", "https://arakawa-story.com/", "https://arakawa-story.com/?feed=rss2", "東京都", "荒川区"),
  S("むーなび", "https://mu-navi.com/", "https://mu-navi.com/feed/", "東京都", "武蔵村山市"),
  S("おめ通", "https://ometsu.net/", "https://ometsu.net/feed/", "東京都", "青梅市"),
  S("しもブロ", "https://www.shimokitazawa.info/", "https://www.shimokitazawa.info/feed/", "東京都", "世田谷区"),
  S("変わりゆく町田の街並み", "https://kawariyuku-machida.com/", "https://kawariyuku-machida.com/feed/", "東京都", "町田市"),
  // ===== 千葉 =====
  S("流山つうしん", "https://nagareyama-tsushin.com/", "https://nagareyama-tsushin.com/feed/", "千葉県", "流山市"),
  // ===== 埼玉北部 =====
  S("カゴハラネット", "https://kagohara.net/", "https://kagohara.net/feed/", "埼玉県", "熊谷市"),
  S("埼北つうしん さいつう", "https://sai2.info/", "https://sai2.info/feed/", "埼玉県", "本庄市"),
  // ===== 愛知 非名古屋 =====
  S("春日井つーしん", "https://kasugai2.jp/", "https://kasugai2.jp/index.rdf", "愛知県", "春日井市"),
  // ちたまるNavi: rss-parserのデフォルトUAに406を返すが、crawl.tsのフォールバック
  // （Mozilla/5.0 ChiikiRadar UAでのfetch再パース）で取得可能かをバックフィルで要確認。
  S("ちたまるNavi", "https://www.chitamaru.jp/", "https://www.chitamaru.jp/feed/rss.xml", "愛知県", null),
  S("コハクの豊田市ぼっちグルメ", "https://toyotanikublog.com/", "https://toyotanikublog.com/feed/", "愛知県", "豊田市"),
  // ===== 大阪（南部・河内の空白補強）=====
  S("大阪つーしん", "https://www.osaka2.jp/", "https://www.osaka2.jp/archives/cat_204598.xml", "大阪府", "大阪市"),
  S("泉北・金剛さやまコミュニティ", "https://sencomi.com/", "https://sencomi.com/feed/", "大阪府", "堺市"),
  // ===== 京都（最も手薄）=====
  S("Kyotopi", "https://kyotopi.jp/", "http://kyotopi.jp/kyotopi.rss", "京都府", "京都市"),
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
