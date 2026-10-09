// 記事の読み取りルールの動作確認（実際の記事見出しから作った例）。
// 実行: npx tsx scripts/test-extract.ts   … ルールを直したら必ず実行し、全件 OK を確認する
import {
  classifyArticle,
  extractAddress,
  extractCity,
  extractGenre,
  extractNearestStation,
  extractOpenDate,
  extractStoreName,
  extractTel,
  isChainStore,
  namesCompatible,
  cityMentioned,
  type Pref,
} from "./lib/normalize";
import { parseItenpoDetail, parseItenpoList } from "./lib/itenpo";

let ng = 0;
function eq(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) ng++;
  console.log(`${ok ? "OK " : "NG "} ${label} → ${JSON.stringify(actual)}${ok ? "" : `（期待: ${JSON.stringify(expected)}）`}`);
}

// ---- 開店記事の判定
const open = (t: string, body = "") => classifyArticle(t, body).ok;
eq("麻辣湯の開店", open("【練馬区】大泉学園に「高和麻辣湯」がオープンします！"), true);
eq("記念キャンペーン付きの開店", open("【渋谷区】洋風居酒屋Pecoriが渋谷にオープンします！オープン記念のキャンペーンも実施します！"), true);
eq("隣の店に触れても飲食", open("【川崎市中原区】元住吉：ブーランジュリードゥーブ 元住吉店 10月16日オープン！ COCOLANCE隣に新ベーカリー誕生"), true);
eq("跡地の業種は数えない", open("しんぱち食堂 西船橋店が10/8（木）オープン、朝7時から営業、メガネのアイボン跡地"), true);
eq("新店が買取店", open("【東武練馬】高級食パン店跡地は買取専門店「バイセル」が2026年9月26日オープン"), false);
eq("閉店記事", open("【柏市】再OPENに向けて休業していた『スワンベーカリー柏店』が9月14日に閉店していたことがわかりました。"), false);
eq("閉店後に別店がオープン", open("【羽曳野市】「ステーキガスト 羽曳野店」閉店後は『資さんうどん 羽曳野店』がオープン予定です。"), true);
eq("閉店からの再開", open("【続報】9/10（木）新小岩駅北口前の喫茶店「ルノアール 新小岩店」がリニューアルオープン、閉店から改装を経て営業再開"), true);
eq("期間限定の出店", open("【大阪市福島区】9月12日(土)福島1丁目に中東料理の「Arab Breeze」が約1か月の期間限定オープン"), false);
eq("ジム", open("【板橋区】女性専用24時間ジム「FLATTE24板橋店」がリニューアルオープン！"), false);
eq("ネットカフェ", open("【新宿区】ネットカフェ「快活CLUB」がオープン"), false);
eq("グローバルは飲食ではない", open("【杉並区】高円寺に世界のポップカルチャーが集まる！？「HACCO: Global POP Culture」がオープン！"), false);
eq("経済新聞形式", open("六本木に京都発の日本料理店「やま六」　都内初出店"), true);

// ---- 店名
eq("店名: 主語の鉤括弧", extractStoreName("【台東区】3月26日（木）JR上野駅すぐそばの「上野の森さくらテラス」に、「牛かつもと村 上野の森さくらテラス店」がオープン"), "牛かつもと村 上野の森さくらテラス店");
eq("店名: 跡地の鉤括弧は避ける", extractStoreName("【藤沢市】藤沢駅南口にあった「鰻の成瀬」跡地に「酒と鰻と定食と。うなやま」が4月6日にオープン"), "酒と鰻と定食と。うなやま");
eq("店名: 区切りの後ろの店名", extractStoreName("【休業】地元衣笠で開業した辛くない担々麺新店 – 北区 – 麺屋 坦坦軒"), "麺屋 坦坦軒");
eq("店名: 区切りの前の店名", extractStoreName("油そばきりん寺 金閣寺店 – 【京都ラーメン】北区が新店オープン"), "油そばきりん寺 金閣寺店");
eq("店名: 店名＠地名", extractStoreName("やきとん蓮＠桜台【10/7オープン】"), "やきとん蓮");
eq("店名: 英字の店名＠地名", extractStoreName("Hamburg Steak & Bar PORT＠江古田【10/5オープン】"), "Hamburg Steak & Bar PORT");
eq("店名: 先頭の[開店]札", extractStoreName("[開店]らーめん大桜 相模原店"), "らーめん大桜 相模原店");
eq("店名: ○○に△△がオープン", extractStoreName("亀戸に銀だこハイボール酒場がオープンしたよ。"), "銀だこハイボール酒場");
eq("店名: 本文の店名欄", extractStoreName("祝！2026年4月1日、代々木に干物定食のお店がオープンします。", "…店名は「満腹食堂 誠」です。住所…"), "満腹食堂 誠");
eq("店名: 末尾の【店名】", extractStoreName("【川越市】新店のご案内♪ 川越駅の駅ビルに麻辣湯（マーラータン）のお店がオープン！【七宝麻辣湯】"), "七宝麻辣湯");

// ---- 住所・市区町村
eq("住所: 見出し付き", extractAddress("…情報提供ありがとうございました。 ジョニーヌードル大島店 住所 東京都江東区大島6丁目30−16 最寄り駅 都営新宿線大島駅"), "東京都江東区大島6丁目30−16");
eq("住所: 文章の誤読は捨てる", extractAddress("大阪府内を中心に油そば・まぜそばロマン11店舗を展開"), null);
eq("住所: 後ろの説明を切る", extractAddress("場所は千葉県市原市千種5丁目に「のうえんカフェ」が"), "千葉県市原市千種5丁目");
eq("住所: 都府県なしを補う", extractAddress("住所：川崎市中原区木月1-35-45", "東京都"), "神奈川県川崎市中原区木月1-35-45");
eq("市: 東村山市", extractCity("東京都東村山市本町1-2-3", "東京都"), "東村山市");
eq("市: 政令市の区", extractCity("大阪府大阪市北区梅田1-1-1", "大阪府"), "大阪市北区");
eq("市: 区だけの表記", extractCity("神奈川県中原区木月1-2", "神奈川県"), "川崎市中原区");
eq("市: 郡を省いた町", extractCity("埼玉県三芳町藤久保1-1", "埼玉県"), "入間郡三芳町");
eq("文中の市区町村: 千葉の中央区", cityMentioned("7月6日、中央区松波にオープン", "千葉県" as Pref), { pref: "千葉県", city: "千葉市中央区" });
eq("文中の市区町村: 半田市", cityMentioned("旬魚の刺身や天ぷらが楽しめる！海鮮居酒屋「翡翠」半田市に9/14(月)オープン"), { pref: "愛知県", city: "半田市" });

// ---- 電話
eq("電話: 画像ファイル名は読まない", extractTel('<img src="/wp-content/uploads/2021/10/2020080203-110x110.png" alt="情報提供"> TEL：03-3673-2066'), "0336732066");
eq("電話: 運営会社の番号は読まない", extractTel("広告掲載 利用規約 運営会社 株式会社morondo (072-396-4400)"), null);
eq("電話: 桁数のおかしい番号", extractTel("TEL：0930-120-193863"), null);

// ---- オープン日
const d = new Date("2026-09-20T03:00:00Z");
eq("日付: 曜日つき", extractOpenDate("2026年10月1日(木)にオープンします", d), "2026-10-01");
eq("日付: スラッシュ", extractOpenDate("【10/3OPEN】八王子駅南口", d), "2026-10-03");
eq("日付: グランド", extractOpenDate("10月14日11時グランドオープン！", d), "2026-10-14");
eq("日付: 見出し語", extractOpenDate("オープン予定日：2026年11月27日（金）", d), "2026-11-27");
eq("日付: 年をまたぐ", extractOpenDate("1月10日オープン予定", new Date("2026-12-05T03:00:00Z")), "2027-01-10");
eq("日付: 時期だけは空欄", extractOpenDate("10月中旬オープン予定", d), null);
eq("日付: 見出し先頭の日付", extractOpenDate("10月9日（金）、荒川区内にまた新たなクレープ専門店「クレープ＆AN」がオープン", d), "2026-10-09");
eq("日付: 先頭の日付でも閉店の話は読まない", extractOpenDate("9月30日（水）、駅前の老舗が閉店", d), null);

// ---- ジャンル・最寄駅・チェーン
eq("ジャンル: ベーカリーはカレーではない", extractGenre("カレーパンが人気", "南葛西公園内にベーカリー「SAKImoto」"), "ベーカリー");
eq("ジャンル: 業態の語を優先", extractGenre("", "原価酒場！名物はもつ鍋！4/15(水)に居酒屋がオープン"), "居酒屋");
eq("ジャンル: 店名のそば", extractGenre("", "すかいらーくの「八郎そば」が東京初進出！", "八郎そば"), "そば");
eq("駅: 路線名を外す", extractNearestStation("最寄り駅 都営新宿線大島駅"), "大島駅");
eq("駅: 駅名の私鉄名は残す", extractNearestStation("東武練馬駅から徒歩3分"), "東武練馬駅");
eq("駅: 最寄り駅は駅名ではない", extractNearestStation("最寄り駅からすぐ"), null);
eq("チェーン: ガストロノミアはガストではない", isChainStore("VERACE PANETTERIA-GASTRONOMIA（ヴェラーチェ パネッテリア ガストロノミア）"), false);
eq("チェーン: 丸亀製麺", isChainStore("丸亀製麺 ○○店"), true);

// ---- 店名の比較（重複判定）
eq("同じ店: 支店名つき", namesCompatible("焼肉ホルモン よし川", "焼肉 ホルモン よし川 向ヶ丘遊園店"), true);
eq("別の店", namesCompatible("やきとり にしだ場", "中華料理 ふく銀"), false);

// ---- 居抜き店舗.com（一覧ページと記事ページの表）
const itenpoList = parseItenpoList(
  `<ul><li class="c-blogList__item"><div class="js-link" href="/news/open/14135"><h3 class="c-blogList__item__ttl">OPEN 参鶏湯Village（代官山駅）</h3>` +
    `<p class="c-blogList__item__info__date"> 投稿日： 2026.10.07 </p></div></li></ul>`,
);
eq("居抜き: 一覧", itenpoList.map((x) => [x.link, x.title, x.date?.toISOString()]), [
  ["https://www.i-tenpo.com/news/open/14135", "OPEN 参鶏湯Village（代官山駅）", "2026-10-07T03:00:00.000Z"],
]);
const itenpoDetail = parseItenpoDetail(
  `<div class="p-blogDetail__content"><h2>【代官山】駅徒歩4分「参鶏湯Village」オープン！</h2><table class="content_table"><tbody>` +
    `<tr><th>開店日</th><td>2026年9月19日</td></tr><tr><th>店舗名</th><td>参鶏湯Village</td></tr>` +
    `<tr><th>業態</th><td><a href="/korean/">韓国料理</a></td></tr><tr><th>最寄駅</th><td><a href="/tokyo/daikanyama-st/">代官山駅</a></td></tr>` +
    `<tr><th>徒 歩</th><td>4分</td></tr></tbody></table>` +
    `<iframe src="https://www.google.com/maps/embed?pb=!1m13!1m8!1m3!1d12968.3!2d139.70515!3d35.65024!3m2!1i1024"></iframe></div>`,
);
eq("居抜き: 記事の表", [itenpoDetail.fields["店舗名"], itenpoDetail.fields["業態"], itenpoDetail.fields["最寄駅"], itenpoDetail.fields["徒歩"]], ["参鶏湯Village", "韓国料理", "代官山駅", "4分"]);
eq("居抜き: 地図の位置", [itenpoDetail.lat, itenpoDetail.lon], [35.65024, 139.70515]);

console.log(ng === 0 ? "\n全件 OK" : `\nNG ${ng} 件`);
process.exitCode = ng === 0 ? 0 : 1;
