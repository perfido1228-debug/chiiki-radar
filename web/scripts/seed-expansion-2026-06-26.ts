import { sb } from "./lib/supabase";

// 2026-06-26 収集網拡張: 号外NET/経済新聞に実在するのに未登録だった同形式RSS 50件。
// 全てフィード生存・各10件取得を probe-candidates.ts で確認済み。
type Seed = {
  name: string; url: string; rss_url: string;
  source_type: "号外NET" | "経済新聞"; pref: string; city: string | null;
};

const G = (sub: string, name: string, pref: string, city: string): Seed => ({
  name: `号外NET ${name}`,
  url: `https://${sub}.goguynet.jp/`,
  rss_url: `https://${sub}.goguynet.jp/category/cat_openclose/feed/`,
  source_type: "号外NET", pref, city,
});
const K = (sub: string, name: string, pref: string, city: string): Seed => ({
  name: `${name}経済新聞`,
  url: `https://${sub}.keizai.biz/`,
  rss_url: `https://${sub}.keizai.biz/rss.xml`,
  source_type: "経済新聞", pref, city,
});

const SOURCES: Seed[] = [
  // ===== 号外NET (21) =====
  G("nishitokyo", "西東京市", "東京都", "西東京市"),
  G("ome-hamura", "青梅市・羽村市", "東京都", "青梅市"),
  G("kazo-hanyu", "加須市・羽生市・行田市", "埼玉県", "加須市"),
  G("kuki-satte", "久喜市・幸手市", "埼玉県", "久喜市"),
  G("shiraoka-hasuda", "白岡市・蓮田市", "埼玉県", "白岡市"),
  G("misato-yashio", "三郷市・八潮市・吉川市", "埼玉県", "三郷市"),
  G("kumagaya", "熊谷市", "埼玉県", "熊谷市"),
  G("kounosu-kitamoto", "鴻巣市・北本市", "埼玉県", "鴻巣市"),
  G("ageo-okegawa", "上尾市・桶川市", "埼玉県", "上尾市"),
  G("sakado-tsurugashima", "坂戸市・鶴ヶ島市", "埼玉県", "坂戸市"),
  G("fujimi-fujimino", "富士見市・ふじみ野市", "埼玉県", "富士見市"),
  G("sayama-iruma", "狭山市・入間市", "埼玉県", "狭山市"),
  G("fukaya-honjo", "深谷市・本庄市", "埼玉県", "深谷市"),
  G("hadano-isehara", "秦野市・伊勢原市", "神奈川県", "秦野市"),
  G("yokohamakanazawa-isogo", "横浜市金沢区・磯子区", "神奈川県", "横浜市"),
  G("kawasakimiyamae", "川崎市宮前区", "神奈川県", "川崎市"),
  G("odawara", "小田原市", "神奈川県", "小田原市"),
  G("kisarazu-kimitsu-futtsu-sodegaura", "木更津市・君津市・富津市・袖ケ浦市", "千葉県", "木更津市"),
  G("abiko", "我孫子市", "千葉県", "我孫子市"),
  G("narita-tomisato", "成田市・富里市", "千葉県", "成田市"),
  G("kamagaya-shiroi-inzai", "鎌ケ谷市・白井市・印西市", "千葉県", "鎌ケ谷市"),

  // ===== 経済新聞 (29) =====
  K("edogawa", "江戸川", "東京都", "江戸川区"),
  K("katsushika", "葛飾", "東京都", "葛飾区"),
  K("koto", "江東", "東京都", "江東区"),
  K("asakusa", "浅草", "東京都", "台東区"),
  K("bunkyo", "文京", "東京都", "文京区"),
  K("akiba", "アキバ", "東京都", "千代田区"),
  K("akabane", "赤羽", "東京都", "北区"),
  K("nerima", "練馬", "東京都", "練馬区"),
  K("takadanobaba", "高田馬場", "東京都", "新宿区"),
  K("koenji", "高円寺", "東京都", "杉並区"),
  K("kyodo", "経堂", "東京都", "世田谷区"),
  K("nikotama", "二子玉川", "東京都", "世田谷区"),
  K("sancha", "三軒茶屋", "東京都", "世田谷区"),
  K("nishitama", "西多摩", "東京都", "青梅市"),
  K("adachi", "北千住", "東京都", "足立区"),
  K("yokosuka", "横須賀", "神奈川県", "横須賀市"),
  K("zushi-hayama", "逗子葉山", "神奈川県", "逗子市"),
  K("kamakura", "鎌倉", "神奈川県", "鎌倉市"),
  K("shonan", "湘南", "神奈川県", "藤沢市"),
  K("odawara-hakone", "小田原箱根", "神奈川県", "小田原市"),
  K("kawaguchi", "川口", "埼玉県", "川口市"),
  K("sayama", "狭山", "埼玉県", "狭山市"),
  K("kumagaya", "熊谷", "埼玉県", "熊谷市"),
  K("honjo", "本庄", "埼玉県", "本庄市"),
  K("chichibu", "秩父", "埼玉県", "秩父市"),
  K("urayasu", "浦安", "千葉県", "浦安市"),
  K("narashino", "習志野", "千葉県", "習志野市"),
  K("sotobo", "外房", "千葉県", "茂原市"),
  K("choshi", "銚子", "千葉県", "銚子市"),
];

async function main() {
  console.log(`Seeding ${SOURCES.length} new sources...`);
  let ok = 0, fail = 0;
  for (const s of SOURCES) {
    const { error } = await sb.from("sources").upsert({ ...s, enabled: true }, { onConflict: "url" });
    if (error) { console.error(`[${s.name}] ${error.message}`); fail++; }
    else ok++;
  }
  const { count } = await sb.from("sources").select("*", { count: "exact", head: true }).eq("enabled", true);
  console.log(`Done. ok=${ok} fail=${fail} / total enabled sources now: ${count}`);
}
main().catch(console.error);
