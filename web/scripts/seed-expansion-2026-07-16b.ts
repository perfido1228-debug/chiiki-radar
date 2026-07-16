import { sb } from "./lib/supabase";

// 2026-07-16 収集網 大規模拡張(第2弾): 「全国ローカルニュースサイト名鑑」(news.gotouti.jp)
// を7府県全域で網羅調査し発掘した独立系ローカルメディア26件。
// 全てフィード生存・実際の開店/新店記事の掲載をrss-parserで確認済み。
// （さかイーネ等の更新停滞・フィード無効サイトは調査の上で除外）
type Seed = {
  name: string; url: string; rss_url: string;
  source_type: string; pref: string; city: string | null; enabled: boolean;
};

const S = (name: string, url: string, rss_url: string, pref: string, city: string | null): Seed =>
  ({ name, url, rss_url, source_type: "独立系ブログ", pref, city, enabled: true });

const SOURCES: Seed[] = [
  // ===== 東京 =====
  S("とよすと", "https://toyosu.tokyo/", "https://toyosu.tokyo/category/open-close/feed/", "東京都", "江東区"),
  S("大森・蒲田つーしん", "https://omori-kamata.com/", "https://omori-kamata.com/category/open-close/feed/", "東京都", "大田区"),
  S("東京ルッチ", "https://tokyolucci.jp/", "https://tokyolucci.jp/feed/", "東京都", null),
  S("吉祥寺.me", "https://kichijoji.me/", "https://kichijoji.me/feed/", "東京都", "武蔵野市"),
  // ===== 神奈川 =====
  S("はまぴた", "https://hamapita.com/", "https://hamapita.com/category/gourmet/feed/", "神奈川県", "横浜市"),
  S("はまこれ横浜", "https://hamakore.yokohama/", "https://hamakore.yokohama/category/gourmet/feed/", "神奈川県", "横浜市"),
  S("武蔵小杉住んでみた。", "https://musashikosugi-sundemita.com/", "https://musashikosugi-sundemita.com/category/open-close/feed/", "神奈川県", "川崎市中原区"),
  S("個人的横浜", "https://1201.yokohama/", "https://1201.yokohama/feed/", "神奈川県", "横浜市"),
  // ===== 千葉 =====
  S("浦安に住みたい！web", "https://sumitai.ne.jp/urayasu/", "https://sumitai.ne.jp/urayasu/category/gourmet/feed/", "千葉県", "浦安市"),
  S("松戸ロード", "https://wl29.net/", "https://wl29.net/category/openclose/feed/", "千葉県", "松戸市"),
  S("きさらづレポート", "https://www.kisarepo.jp/", "https://www.kisarepo.jp/category/openclose/feed/", "千葉県", "木更津市"),
  // ===== 埼玉 =====
  S("カワゴエ・マス・メディア", "https://koedo.info/", "https://koedo.info/feed/", "埼玉県", "川越市"),
  // ===== 愛知 =====
  S("ちくさん", "https://chiku-san.com/", "https://chiku-san.com/category/open-close/feed/", "愛知県", "名古屋市千種区"),
  S("岡崎にゅーす", "https://okanyu.jp/", "https://okanyu.jp/category/openclose/feed/", "愛知県", "岡崎市"),
  S("オカトピ", "https://xn--4ituj.net/", "https://xn--4ituj.net/category/gourmet/feed/", "愛知県", "岡崎市"),
  S("小牧つーしん", "https://komaki2.jp/", "https://komaki2.jp/index.rdf", "愛知県", "小牧市"),
  S("CHITAZINE", "https://chitazine.com/", "https://chitazine.com/feed/", "愛知県", null),
  S("江南しえなん", "https://konanjoho.com/", "https://konanjoho.com/feed/", "愛知県", "江南市"),
  // ===== 大阪 =====
  S("交野タイムズ", "https://www.katano-times.com/", "https://www.katano-times.com/index.rdf", "大阪府", "交野市"),
  S("TNN豊中報道。2", "https://toyo-2.jp/", "https://toyo-2.jp/feed/", "大阪府", "豊中市"),
  // 大阪つーしん(株式会社morondo系。号外NET/ku2shin系とは別ネットワークの独立系。開店ネタ濃厚)
  S("枚方つーしん", "https://www.hira2.jp/", "https://www.hira2.jp/category/open-close/feed/", "大阪府", "枚方市"),
  S("高槻つーしん", "https://www.takatsuki2.jp/", "https://www.takatsuki2.jp/index.rdf", "大阪府", "高槻市"),
  S("茨木つーしん", "https://www.iba2.jp/", "https://www.iba2.jp/index.rdf", "大阪府", "茨木市"),
  // ===== 京都 =====
  S("京都速報", "https://kyo-soku.com/", "https://kyo-soku.com/category/open-close/feed/", "京都府", "京都市"),
  S("ALCO 宇治・城陽", "https://alco-uj.com/", "https://alco-uj.com/category/gourmet/feed/", "京都府", "宇治市"),
  S("ALCO 京都伏見", "https://alco-kyotofushimi.com/", "https://alco-kyotofushimi.com/category/gourmet/feed/", "京都府", "京都市伏見区"),
];

async function main() {
  console.log(`Seeding ${SOURCES.length} local media sources (名鑑 sweep)...`);
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
