import { sb } from "./lib/supabase";

// 2026-10-09 収集網 追加拡張(第7弾): リビングWeb「開店・閉店」の1都3県の地域版8件（ユーザー承認: 専用の読み取りを作って追加）。
// フィードの中身が空なので、一覧ページ（/page/N）を lib/living.ts で読み、記事ページは本文（#single）を読む（crawl.ts の SOURCE_RULES）。
// 名古屋・大阪・北摂の版もあるが、今回は首都圏だけ（追加するときは同じ形で足す）。
type Seed = {
  name: string; url: string; rss_url: string;
  source_type: string; pref: string; city: string | null; enabled: boolean;
};
const L = (area: string, label: string, pref: string): Seed => {
  const url = `https://mrs.living.jp/${area}/newopen/`;
  return { name: `リビングWeb ${label} 開店・閉店`, url, rss_url: url, source_type: "独立系ブログ", pref, city: null, enabled: true };
};

const SOURCES: Seed[] = [
  L("tokyo", "東京", "東京都"),
  L("musashino", "むさしの", "東京都"),
  L("tama", "多摩", "東京都"),
  L("yokohama", "横浜", "神奈川県"),
  L("denen", "田園都市", "神奈川県"),
  L("saitama", "埼玉", "埼玉県"),
  L("chiba", "千葉", "千葉県"),
  L("kashiwa", "かしわ", "千葉県"),
];

async function main() {
  console.log(`Seeding ${SOURCES.length} sources (Living Web new-open lists)...`);
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
