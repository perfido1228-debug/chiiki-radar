import { sb } from "./lib/supabase";

// 2026-07-16 収集網拡張: 独立系ローカルメディア6件。
// 号外NET/経済新聞の網では拾えていなかった個人・地域運営のブログ。
// 全てフィード生存・実際の開店記事取得を確認済み（バックフィル実施済み）。
//
// 発端: 社員から「なりますチャンネルのダリマキッチンが出てこない」との報告。
// 未登録の独立系メディアを調査・追加した。
type Seed = {
  name: string; url: string; rss_url: string;
  source_type: string; pref: string; city: string | null; enabled: boolean;
};

const SOURCES: Seed[] = [
  // 板橋・練馬エリア（報告のサイト）。開店/閉店カテゴリ(cat=106)フィードで高精度。
  { name: "なりますチャンネル", url: "https://www.narimasu.tokyo/", rss_url: "https://www.narimasu.tokyo/?cat=106&feed=rss2", source_type: "独立系ブログ", pref: "東京都", city: "板橋区", enabled: true },
  // 練馬区タウン誌。全記事フィード＋isFoodOpening判定で拾う。
  { name: "ネリマンタイムス", url: "https://nerimantimes.jp/", rss_url: "https://nerimantimes.jp/feed", source_type: "独立系ブログ", pref: "東京都", city: "練馬区", enabled: true },
  // 千葉市中心のグルメブログ。実開店記事が多く住所抽出精度も高い。
  { name: "孤高の千葉グルメ", url: "https://kokou-chiba.com/", rss_url: "https://kokou-chiba.com/feed/", source_type: "独立系ブログ", pref: "千葉県", city: "千葉市", enabled: true },
  // 多摩全域。開店・閉店カテゴリフィード。イオン等の商業施設も含む。
  { name: "多摩っち", url: "https://tama.media/", rss_url: "https://tama.media/category/%E9%96%8B%E5%BA%97%E3%83%BB%E9%96%89%E5%BA%97/feed/", source_type: "独立系ブログ", pref: "東京都", city: null, enabled: true },
  // 下町エリア広域。まとめ記事主体で現状の収穫は少ないが実開店も稀にあり。
  { name: "cocoré magazine", url: "https://cocore-magazine.com/", rss_url: "https://cocore-magazine.com/feed/", source_type: "独立系ブログ", pref: "東京都", city: null, enabled: true },
  // すきグルメ東京ネット: 新店特化フィードだが「東京全域」指定で市区町村が特定できず
  // 全件除外され収穫ゼロのため無効化。将来 市区町村抽出を強化したら再有効化を検討。
  { name: "すきグルメ東京ネット", url: "https://tokyo-gurume.com/", rss_url: "https://tokyo-gurume.com/category/newopen/feed/", source_type: "独立系ブログ", pref: "東京都", city: null, enabled: false },
];

async function main() {
  console.log(`Seeding ${SOURCES.length} independent local media sources...`);
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
