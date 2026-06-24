export type SourceDef = {
  name: string;
  url: string;
  rss_url: string;
  source_type: "号外NET" | "経済新聞" | "独立系ブログ" | "つうしん系" | "ku2shin系";
  pref: "東京都" | "神奈川県" | "千葉県" | "埼玉県" | "愛知県" | "大阪府" | "京都府";
  city: string | null;
  enabled?: boolean;
};

const goguy = (sub: string, name: string, pref: SourceDef["pref"], city: string | null): SourceDef => ({
  name: `号外NET ${name}`,
  url: `https://${sub}.goguynet.jp/`,
  rss_url: `https://${sub}.goguynet.jp/category/cat_openclose/feed/`,
  source_type: "号外NET",
  pref,
  city,
});

// keizai.biz は 2025〜 RSS パスを /list_1.xml → /rss.xml に移行（旧パスは全紙404）
const keizai = (sub: string, name: string, pref: SourceDef["pref"], city: string | null): SourceDef => ({
  name: `${name}経済新聞`,
  url: `https://${sub}.keizai.biz/`,
  rss_url: `https://${sub}.keizai.biz/rss.xml`,
  source_type: "経済新聞",
  pref,
  city,
});

export const ALL_SOURCES: SourceDef[] = [
  // ========== 号外NET (78サイト) ==========
  // 東京23区
  goguy("shinjuku", "新宿区", "東京都", "新宿区"),
  goguy("shibuya", "渋谷区", "東京都", "渋谷区"),
  goguy("shinagawa", "品川区", "東京都", "品川区"),
  goguy("meguro", "目黒区", "東京都", "目黒区"),
  goguy("otaku", "大田区", "東京都", "大田区"),
  goguy("setagaya", "世田谷区", "東京都", "世田谷区"),
  goguy("suginami", "杉並区", "東京都", "杉並区"),
  goguy("nakano", "中野区", "東京都", "中野区"),
  goguy("nerima", "練馬区", "東京都", "練馬区"),
  // 豊島区: 号外NETサイト未開設（wp-signup へリダイレクト）のため除外
  goguy("tokyokita", "北区", "東京都", "北区"),
  goguy("itabashi", "板橋区", "東京都", "板橋区"),
  goguy("arakawa", "荒川区", "東京都", "荒川区"),
  goguy("adachi", "足立区", "東京都", "足立区"),
  goguy("katsushika", "葛飾区", "東京都", "葛飾区"),
  goguy("edogawa", "江戸川区", "東京都", "江戸川区"),
  goguy("koto", "江東区", "東京都", "江東区"),
  goguy("sumida", "墨田区", "東京都", "墨田区"),
  goguy("taito", "台東区", "東京都", "台東区"),
  goguy("bunkyo", "文京区", "東京都", "文京区"),
  // 東京多摩
  goguy("hachioji", "八王子市", "東京都", "八王子市"),
  goguy("tachikawa-akishima", "立川市・昭島市", "東京都", "立川市"),
  goguy("musashino", "武蔵野市・小金井市", "東京都", "武蔵野市"),
  goguy("mitaka", "三鷹市", "東京都", "三鷹市"),
  goguy("tokyofuchu", "府中市", "東京都", "府中市"),
  goguy("chofu-komae", "調布市・狛江市", "東京都", "調布市"),
  goguy("machida", "町田市", "東京都", "町田市"),
  goguy("kodaira", "小平市", "東京都", "小平市"),
  goguy("kokubunji-kunitachi", "国分寺市・国立市", "東京都", "国分寺市"),
  goguy("higashikurume-kiyose", "東久留米市・清瀬市", "東京都", "東久留米市"),
  goguy("tama-inagi", "多摩市・稲城市", "東京都", "多摩市"),
  goguy("hino", "日野市", "東京都", "日野市"),
  // 神奈川
  goguy("yokohamanaka-nishi", "横浜市中区・西区", "神奈川県", "横浜市中区"),
  goguy("yokohamakanagawa", "横浜市神奈川区", "神奈川県", "横浜市神奈川区"),
  goguy("yokohamaminami", "横浜市南区", "神奈川県", "横浜市南区"),
  goguy("yokohamakonan-sakae", "横浜市港南区・栄区", "神奈川県", "横浜市港南区"),
  goguy("yokohamahodogaya", "横浜市保土ケ谷区", "神奈川県", "横浜市保土ケ谷区"),
  goguy("yokohamakohoku", "横浜市港北区", "神奈川県", "横浜市港北区"),
  goguy("yokohamatsuzuki", "横浜市都筑区", "神奈川県", "横浜市都筑区"),
  goguy("yokohamamidori-aoba", "横浜市緑区・青葉区", "神奈川県", "横浜市青葉区"),
  goguy("kawasakinakahara", "川崎市中原区", "神奈川県", "川崎市中原区"),
  goguy("kawasakitama", "川崎市多摩区", "神奈川県", "川崎市多摩区"),
  goguy("sagamiharachuoku", "相模原市中央区", "神奈川県", "相模原市中央区"),
  goguy("sagamihara-minamiku", "相模原市南区", "神奈川県", "相模原市南区"),
  goguy("yokosuka", "横須賀市・三浦市", "神奈川県", "横須賀市"),
  goguy("kamakura-zushi", "鎌倉市・逗子市・葉山町", "神奈川県", "鎌倉市"),
  goguy("fujisawa", "藤沢市", "神奈川県", "藤沢市"),
  goguy("chigasaki", "茅ヶ崎市", "神奈川県", "茅ヶ崎市"),
  goguy("hiratsuka", "平塚市・大磯町", "神奈川県", "平塚市"),
  goguy("atsugi", "厚木市", "神奈川県", "厚木市"),
  goguy("ebina-zama-ayase", "海老名市・座間市・綾瀬市", "神奈川県", "海老名市"),
  goguy("yamato", "大和市", "神奈川県", "大和市"),
  // 千葉
  goguy("chiba", "千葉市", "千葉県", "千葉市"),
  goguy("chibainage", "千葉市稲毛区・花見川区・美浜区", "千葉県", "千葉市稲毛区"),
  goguy("funabashi", "船橋市", "千葉県", "船橋市"),
  goguy("ichikawa", "市川市", "千葉県", "市川市"),
  goguy("matsudo", "松戸市", "千葉県", "松戸市"),
  goguy("kashiwa", "柏市", "千葉県", "柏市"),
  goguy("nagareyama-noda", "流山市・野田市", "千葉県", "流山市"),
  goguy("yachiyo-narashino", "八千代市・習志野市", "千葉県", "八千代市"),
  goguy("sakura-yotsukaido-yachimata", "佐倉市・四街道市・八街市", "千葉県", "佐倉市"),
  goguy("ichihara", "市原市", "千葉県", "市原市"),
  // 埼玉
  goguy("saitama", "さいたま市", "埼玉県", "さいたま市"),
  goguy("saitamaurawa-midori", "さいたま市浦和区・緑区", "埼玉県", "さいたま市浦和区"),
  goguy("saitamaminuma-iwatsuki", "さいたま市見沼区・岩槻区", "埼玉県", "さいたま市見沼区"),
  goguy("kawaguchi", "川口市", "埼玉県", "川口市"),
  goguy("kawagoe", "川越市", "埼玉県", "川越市"),
  goguy("tokorozawa", "所沢市", "埼玉県", "所沢市"),
  goguy("koshigaya", "越谷市", "埼玉県", "越谷市"),
  goguy("kasukabe", "春日部市", "埼玉県", "春日部市"),
  goguy("soka", "草加市", "埼玉県", "草加市"),
  goguy("asaka-wako", "朝霞市・和光市", "埼玉県", "朝霞市"),
  goguy("niiza-shiki", "新座市・志木市", "埼玉県", "新座市"),
  goguy("toda-warabi", "戸田市・蕨市", "埼玉県", "戸田市"),

  // ========== 経済新聞 (33サイト) ==========
  { name: "ヨコハマ経済新聞", url: "https://www.hamakei.com/", rss_url: "https://www.hamakei.com/rss.xml", source_type: "経済新聞", pref: "神奈川県", city: "横浜市" },
  keizai("kohoku", "港北", "神奈川県", "横浜市港北区"),
  keizai("kawasaki", "川崎", "神奈川県", "川崎市"),
  keizai("machida", "相模原町田", "神奈川県", "相模原市"),
  keizai("chiba", "千葉", "千葉県", "千葉市"),
  keizai("funabashi", "船橋", "千葉県", "船橋市"),
  keizai("matsudo", "松戸", "千葉県", "松戸市"),
  keizai("kujukuri", "九十九里", "千葉県", null),
  keizai("urawa", "浦和", "埼玉県", "さいたま市浦和区"),
  keizai("omiya", "大宮", "埼玉県", "さいたま市大宮区"),
  keizai("kawagoe", "川越", "埼玉県", "川越市"),
  keizai("kasukabe", "春日部", "埼玉県", "春日部市"),
  keizai("shinjuku", "新宿", "東京都", "新宿区"),
  keizai("ikebukuro", "池袋", "東京都", "豊島区"),
  keizai("akasaka", "赤坂", "東京都", "港区"),
  keizai("roppongi", "六本木", "東京都", "港区"),
  keizai("ginza", "銀座", "東京都", "中央区"),
  keizai("shinbashi", "新橋", "東京都", "港区"),
  keizai("nihombashi", "日本橋", "東京都", "中央区"),
  keizai("shinagawa", "品川", "東京都", "品川区"),
  keizai("ichigaya", "市ケ谷", "東京都", "千代田区"),
  keizai("sumida", "すみだ", "東京都", "墨田区"),
  keizai("nakano", "中野", "東京都", "中野区"),
  keizai("tokyobay", "東京ベイ", "東京都", "江東区"),
  keizai("kichijoji", "吉祥寺", "東京都", "武蔵野市"),
  keizai("shimokita", "下北沢", "東京都", "世田谷区"),
  keizai("jiyugaoka", "自由が丘", "東京都", "目黒区"),
  keizai("hachioji", "八王子", "東京都", "八王子市"),
  keizai("tachikawa", "立川", "東京都", "立川市"),
  keizai("chofu", "調布", "東京都", "調布市"),

  // ========== つうしん系 ==========
  { name: "船橋つうしん", url: "https://funabashi-tsushin.com/", rss_url: "https://funabashi-tsushin.com/openclosed/feed/", source_type: "つうしん系", pref: "千葉県", city: "船橋市" },
  { name: "松戸つうしん", url: "https://matsudo-tsushin.com/", rss_url: "https://matsudo-tsushin.com/openclosed/feed/", source_type: "つうしん系", pref: "千葉県", city: "松戸市" },
  { name: "柏つうしん", url: "https://kashiwa-tsushin.com/", rss_url: "https://kashiwa-tsushin.com/openclosed/feed/", source_type: "つうしん系", pref: "千葉県", city: "柏市" },
  // RSSフィード廃止（/feed/が404・代替フィードなし）→無効化。再開にはHTMLスクレイパーが必要
  { name: "我孫子つうしん", url: "https://www.abiko-tsushin.com/", rss_url: "https://www.abiko-tsushin.com/feed/", source_type: "つうしん系", pref: "千葉県", city: "我孫子市", enabled: false },
  { name: "葛飾つうしん", url: "https://katsushika-tsushin.com/", rss_url: "https://katsushika-tsushin.com/openclosed/feed/", source_type: "つうしん系", pref: "東京都", city: "葛飾区" },

  // ========== ku2shin系 ==========
  { name: "しんじゅく通信", url: "https://shinjukuku2shin.com/", rss_url: "https://shinjukuku2shin.com/index.rdf", source_type: "ku2shin系", pref: "東京都", city: "新宿区" },
  { name: "ミナトアイの港区通信", url: "https://minatoku2shin.com/", rss_url: "https://minatoku2shin.com/index.rdf", source_type: "ku2shin系", pref: "東京都", city: "港区" },
  { name: "なかのく通信", url: "https://nakanoku2shin.com/", rss_url: "https://nakanoku2shin.com/index.rdf", source_type: "ku2shin系", pref: "東京都", city: "中野区" },
  { name: "おおたく通信", url: "https://ootaku2shin.com/", rss_url: "https://ootaku2shin.com/index.rdf", source_type: "ku2shin系", pref: "東京都", city: "大田区" },

  // ========== 独立系ローカルメディア ==========
  // 東京23区
  { name: "池袋タイムズ", url: "https://ikebukuro-times.com/", rss_url: "https://ikebukuro-times.com/feed/", source_type: "独立系ブログ", pref: "東京都", city: "豊島区" },
  { name: "いたばしTIMES", url: "https://itabashi-times.com/", rss_url: "https://itabashi-times.com/feed/", source_type: "独立系ブログ", pref: "東京都", city: "板橋区" },
  { name: "赤羽マガジン", url: "https://akabane-shinbun.com/", rss_url: "https://akabane-shinbun.com/feed/", source_type: "独立系ブログ", pref: "東京都", city: "北区" },
  { name: "大田区タイムズ", url: "https://otaku-times.com/", rss_url: "https://otaku-times.com/feed/", source_type: "独立系ブログ", pref: "東京都", city: "大田区", enabled: false }, // RSS廃止(404)→無効化
  { name: "世田谷ガイド", url: "https://setagaya.guide/", rss_url: "https://setagaya.guide/feed/", source_type: "独立系ブログ", pref: "東京都", city: "世田谷区" },
  { name: "南砂一丁目", url: "https://minamisuna1.com/", rss_url: "https://minamisuna1.com/feed/", source_type: "独立系ブログ", pref: "東京都", city: "江東区" },
  { name: "荒川102", url: "https://arakawa102.com/", rss_url: "https://arakawa102.com/feed/", source_type: "独立系ブログ", pref: "東京都", city: "荒川区" },
  { name: "いけぶくろねっと", url: "https://www.ikebukuro-net.jp/", rss_url: "https://www.ikebukuro-net.jp/index.rdf", source_type: "独立系ブログ", pref: "東京都", city: "豊島区" },
  // 東京多摩
  { name: "多摩ポン", url: "https://tamapon.com/", rss_url: "https://tamapon.com/feed/", source_type: "独立系ブログ", pref: "東京都", city: "多摩市" },
  { name: "ちょうふ通信", url: "https://chofucity.com/", rss_url: "https://chofucity.com/index.rdf", source_type: "独立系ブログ", pref: "東京都", city: "調布市" },
  { name: "いいね！立川", url: "https://iine-tachikawa.net/", rss_url: "https://iine-tachikawa.net/feed/", source_type: "独立系ブログ", pref: "東京都", city: "立川市" },
  { name: "八王子ジャーニー", url: "https://8dabe.com/", rss_url: "https://8dabe.com/feed/", source_type: "独立系ブログ", pref: "東京都", city: "八王子市" },
  { name: "府中でみいつけた！", url: "https://mikke-fuchu.com/", rss_url: "https://mikke-fuchu.com/feed/", source_type: "独立系ブログ", pref: "東京都", city: "府中市" },
  // 神奈川
  { name: "横浜日吉新聞", url: "https://hiyosi.net/", rss_url: "https://hiyosi.net/feed/", source_type: "独立系ブログ", pref: "神奈川県", city: "横浜市港北区" },
  { name: "かなレポ川崎", url: "https://kanagawa-report.com/", rss_url: "https://kanagawa-report.com/feed/", source_type: "独立系ブログ", pref: "神奈川県", city: "川崎市" },
  { name: "大和とぴっく", url: "https://www.yamatopi.jp/", rss_url: "https://www.yamatopi.jp/index.rdf", source_type: "独立系ブログ", pref: "神奈川県", city: "大和市" },
  { name: "さがみはらあたり。", url: "https://sagamiharaatari.com/", rss_url: "https://sagamiharaatari.com/feed/", source_type: "独立系ブログ", pref: "神奈川県", city: "相模原市" },
  { name: "相模原ジャーニー", url: "https://sagamihara-journey.com/", rss_url: "https://sagamihara-journey.com/feed/", source_type: "独立系ブログ", pref: "神奈川県", city: "相模原市" },
  { name: "湘南人", url: "https://shonanjin.com/", rss_url: "https://shonanjin.com/feed/", source_type: "独立系ブログ", pref: "神奈川県", city: "藤沢市" },
  { name: "JIMOHACK湘南", url: "https://jimohack-shonan.jp/", rss_url: "https://jimohack-shonan.jp/feed/", source_type: "独立系ブログ", pref: "神奈川県", city: "藤沢市" },
  { name: "とことこ湘南", url: "https://www.shonan-sh.jp/", rss_url: "https://www.shonan-sh.jp/feed/", source_type: "独立系ブログ", pref: "神奈川県", city: "茅ヶ崎市", enabled: false }, // RSS廃止(404)→無効化
  { name: "WEB ふじさわびと", url: "https://www.fujisawabito.net/", rss_url: "https://www.fujisawabito.net/feed/", source_type: "独立系ブログ", pref: "神奈川県", city: "藤沢市", enabled: false }, // RSS廃止(404)→無効化
  { name: "三浦半島日和", url: "https://miurahantou.jp/", rss_url: "https://miurahantou.jp/feed/", source_type: "独立系ブログ", pref: "神奈川県", city: "横須賀市" },
  // 千葉
  { name: "ちば通信", url: "https://chibatsu.jp/", rss_url: "https://chibatsu.jp/index.rdf", source_type: "独立系ブログ", pref: "千葉県", city: "千葉市" },
  { name: "市川にゅ～す", url: "https://ichi-24.jp/", rss_url: "https://ichi-24.jp/feed/", source_type: "独立系ブログ", pref: "千葉県", city: "市川市" },
  { name: "新浦安NAVIGATOR", url: "https://www.shinurayasu-navi.com/", rss_url: "https://www.shinurayasu-navi.com/feed/", source_type: "独立系ブログ", pref: "千葉県", city: "浦安市", enabled: false }, // RSS廃止(404)→無効化
  { name: "まちっと柏", url: "https://machitto.jp/kashiwa/", rss_url: "https://machitto.jp/kashiwa/feed/", source_type: "独立系ブログ", pref: "千葉県", city: "柏市", enabled: false }, // RSS廃止(404)→無効化
  // 埼玉
  { name: "越谷雑談がやてっく", url: "https://koshigaya.gayatec.jp/", rss_url: "https://koshigaya.gayatec.jp/feed/", source_type: "独立系ブログ", pref: "埼玉県", city: "越谷市" },
  { name: "埼玉マガジン", url: "https://saitama-city-marathon.jp/", rss_url: "https://saitama-city-marathon.jp/feed/", source_type: "独立系ブログ", pref: "埼玉県", city: "さいたま市" },
  { name: "川口マガジン", url: "https://kawaguchi-magazine.com/", rss_url: "https://kawaguchi-magazine.com/feed/", source_type: "独立系ブログ", pref: "埼玉県", city: "川口市" },
  { name: "三郷ぐらし", url: "https://misato-gurashi.com/", rss_url: "https://misato-gurashi.com/feed/", source_type: "独立系ブログ", pref: "埼玉県", city: "三郷市" },
  { name: "所沢なび", url: "https://tokorozawanavi.com/", rss_url: "https://tokorozawanavi.com/feed/", source_type: "独立系ブログ", pref: "埼玉県", city: "所沢市" },
  { name: "さいたまっぷる", url: "https://jutaro123.com/", rss_url: "https://jutaro123.com/feed/", source_type: "独立系ブログ", pref: "埼玉県", city: "上尾市" },
  { name: "さいほくらし", url: "https://saikura.info/", rss_url: "https://saikura.info/feed/", source_type: "独立系ブログ", pref: "埼玉県", city: "熊谷市" },
  { name: "食べて埼玉", url: "https://jikomanpuku.com/", rss_url: "https://jikomanpuku.com/feed/", source_type: "独立系ブログ", pref: "埼玉県", city: "さいたま市" },
  { name: "Urawacity.net", url: "https://urawacity.net/", rss_url: "https://urawacity.net/feed/", source_type: "独立系ブログ", pref: "埼玉県", city: "さいたま市浦和区" },
  { name: "宮原大宮ドットコム", url: "https://miyahara-kitaku.com/", rss_url: "https://miyahara-kitaku.com/feed/", source_type: "独立系ブログ", pref: "埼玉県", city: "さいたま市北区" },

  // ========================================================================
  // 関西・中部 拡張（2026-06-16 全RSS実在検証済み）
  // ========================================================================

  // ========== 愛知県 ==========
  // 号外NET（名古屋市は区ブロック別サブドメイン。集約 nagoya は記事0で除外）
  goguy("nagoyakita-higashi", "名古屋市北区・東区", "愛知県", "名古屋市東区"),
  goguy("nagoyanishi-nakamura", "名古屋市西区・中村区", "愛知県", "名古屋市西区"),
  goguy("nagoyameito-chikusa", "名古屋市名東区・千種区", "愛知県", "名古屋市千種区"),
  goguy("nagoyanakagawa-minato", "名古屋市中川区・港区", "愛知県", "名古屋市中川区"),
  goguy("nagoyaatsuta-minami", "名古屋市熱田区・南区", "愛知県", "名古屋市熱田区"),
  goguy("ichinomiya", "一宮市", "愛知県", "一宮市"),
  goguy("ama-tsushima-aisai", "あま市・津島市・愛西市", "愛知県", "あま市"),
  goguy("inazawa", "稲沢市・清須市", "愛知県", "稲沢市"),
  goguy("komaki-inuyama", "小牧市・犬山市", "愛知県", "小牧市"),
  goguy("kasugai", "春日井市", "愛知県", "春日井市"),
  goguy("seto-owariasahi", "瀬戸市・尾張旭市", "愛知県", "瀬戸市"),
  goguy("tokai-obu", "東海市・大府市", "愛知県", "東海市"),
  goguy("toyota", "豊田市", "愛知県", "豊田市"),
  goguy("kariya-chiryu", "刈谷市・知立市", "愛知県", "刈谷市"),
  goguy("anjo-takahama-hekinan", "安城市・高浜市・碧南市", "愛知県", "安城市"),
  goguy("okazaki", "岡崎市", "愛知県", "岡崎市"),
  goguy("nishio", "西尾市・幸田町", "愛知県", "西尾市"),
  goguy("toyokawa-gamagori", "豊川市・蒲郡市", "愛知県", "豊川市"),
  goguy("toyohashi-tahara", "豊橋市・田原市", "愛知県", "豊橋市"),
  // 経済新聞（愛知）
  keizai("sakae", "サカエ", "愛知県", "名古屋市中区"),
  keizai("meieki", "名駅", "愛知県", "名古屋市中村区"),
  keizai("toyota", "豊田", "愛知県", "豊田市"),
  // 独立系（愛知）
  { name: "NAGOYA.（ナゴヤドット）新店", url: "https://nagoyadot.jp/", rss_url: "https://nagoyadot.jp/new/feed/", source_type: "独立系ブログ", pref: "愛知県", city: "名古屋市" },
  { name: "名古屋情報通", url: "https://jouhou.nagoya/", rss_url: "https://jouhou.nagoya/feed/", source_type: "独立系ブログ", pref: "愛知県", city: "名古屋市" },

  // ========== 大阪府 ==========
  // 号外NET（大阪市24区）
  goguy("osaka", "大阪市", "大阪府", "大阪市"),
  goguy("icchome", "大阪市西区", "大阪府", "大阪市西区"),
  goguy("higashiyodogawaku", "大阪市東淀川区", "大阪府", "大阪市東淀川区"),
  goguy("yodogawaku", "大阪市淀川区・西淀川区", "大阪府", "大阪市淀川区"),
  goguy("fukushima-konohana", "大阪市福島区・此花区", "大阪府", "大阪市此花区"),
  goguy("miyakojima-asahi", "大阪市都島区・旭区", "大阪府", "大阪市旭区"),
  goguy("tsurumi-joto", "大阪市鶴見区・城東区", "大阪府", "大阪市鶴見区"),
  goguy("higashinari-ikuno", "大阪市東成区・生野区", "大阪府", "大阪市東成区"),
  goguy("minato-taisho", "大阪市港区・大正区", "大阪府", "大阪市大正区"),
  goguy("tennoji-ku", "大阪市天王寺区・阿倍野区", "大阪府", "大阪市天王寺区"),
  goguy("sumiyoshi-higashisumiyoshi", "大阪市住吉区・東住吉区", "大阪府", "大阪市住吉区"),
  goguy("naniwa-nishinari", "大阪市浪速区・西成区", "大阪府", "大阪市浪速区"),
  goguy("hirano", "大阪市平野区", "大阪府", "大阪市平野区"),
  // 号外NET（大阪府主要都市）
  goguy("suita", "吹田市", "大阪府", "吹田市"),
  goguy("toyonaka", "豊中市", "大阪府", "豊中市"),
  goguy("higashiosaka", "東大阪市", "大阪府", "東大阪市"),
  goguy("ibaraki", "茨木市", "大阪府", "茨木市"),
  goguy("takatsuki", "高槻市", "大阪府", "高槻市"),
  goguy("hirakata", "枚方市", "大阪府", "枚方市"),
  goguy("neyagawa", "寝屋川市", "大阪府", "寝屋川市"),
  goguy("yao", "八尾市", "大阪府", "八尾市"),
  goguy("moriguchikadoma", "守口市・門真市", "大阪府", "守口市"),
  goguy("daitoshijonawate", "大東市・四條畷市", "大阪府", "四條畷市"),
  goguy("minoh", "箕面市・池田市", "大阪府", "箕面市"),
  goguy("settsu", "摂津市・千里丘・南茨木", "大阪府", "摂津市"),
  goguy("izumi", "和泉市", "大阪府", "和泉市"),
  // 号外NET（堺市）
  goguy("sakai-nishi", "堺市堺区・西区", "大阪府", "堺市堺区"),
  goguy("sakaikita-higashi-mihara", "堺市北区・東区・美原区", "大阪府", "堺市北区"),
  goguy("sakainaka-minami", "堺市中区・南区", "大阪府", "堺市中区"),
  // 号外NET（泉州・南河内）
  goguy("kanku-area", "泉大津市・高石市・忠岡町", "大阪府", "泉大津市"),
  goguy("kishiwada-kaizuka", "岸和田市・貝塚市", "大阪府", "岸和田市"),
  goguy("izumisano-sennan-hannan", "泉佐野市・泉南市・阪南市", "大阪府", "泉佐野市"),
  goguy("tondabayashi-kawachinagano", "富田林市・河内長野市", "大阪府", "河内長野市"),
  goguy("habikino-fujiidera-kashiwara", "羽曳野市・藤井寺市・柏原市", "大阪府", "藤井寺市"),
  // 経済新聞（大阪）
  keizai("umeda", "梅田", "大阪府", "大阪市北区"),
  keizai("namba", "なんば", "大阪府", "大阪市中央区"),
  keizai("semba", "船場", "大阪府", "大阪市中央区"),
  keizai("kyobashi", "京橋", "大阪府", "大阪市都島区"),
  keizai("abeno", "あべの", "大阪府", "大阪市阿倍野区"),
  keizai("osakabay", "大阪ベイ", "大阪府", "大阪市住之江区"),
  keizai("higashiosaka", "東大阪", "大阪府", "東大阪市"),
  // 独立系（大阪）
  { name: "さかにゅー", url: "https://sakai-news.jp/", rss_url: "https://sakai-news.jp/category/newface/feed/", source_type: "独立系ブログ", pref: "大阪府", city: "堺市" },
  { name: "関西ニューオープン情報（大阪）", url: "https://kansai-kaiten.com/", rss_url: "https://kansai-kaiten.com/category/osaka/feed/", source_type: "独立系ブログ", pref: "大阪府", city: null },

  // ========== 京都府 ==========
  // 号外NET（京都市は更新頻度低めの区あり）
  goguy("kyoto", "京都市", "京都府", "京都市"),
  goguy("fushimi", "京都市伏見区", "京都府", "京都市伏見区"),
  goguy("kyotoponto", "京都市上京区・中京区・下京区", "京都府", "京都市"),
  goguy("kyotoyamasina-higasiyama", "京都市山科区・東山区", "京都府", "京都市山科区"),
  goguy("kyotoukyo", "京都市右京区", "京都府", "京都市右京区"),
  goguy("kyotosakyo-kita", "京都市左京区・北区", "京都府", "京都市左京区"),
  goguy("uji-joyo", "宇治市・城陽市", "京都府", "宇治市"),
  goguy("nagaokakyo", "長岡京市・向日市・大山崎町", "京都府", "長岡京市"),
  goguy("kyotanabekizugawa", "京田辺市・木津川市・精華町", "京都府", "京田辺市"),
  // 経済新聞（京都）
  keizai("karasuma", "烏丸", "京都府", "京都市中京区"),
  // 独立系（京都）
  { name: "グッチジャパンの京都最新グルメ", url: "https://gcjapan-kyoto.com/", rss_url: "https://gcjapan-kyoto.com/category/%E6%96%B0%E5%BA%97%E3%83%BB%E9%96%89%E5%BA%97/feed/", source_type: "独立系ブログ", pref: "京都府", city: "京都市" },
  { name: "京都のお墨付き！", url: "https://osumituki.com/", rss_url: "https://osumituki.com/feed", source_type: "独立系ブログ", pref: "京都府", city: "京都市" },
];
