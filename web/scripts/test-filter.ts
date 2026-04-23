import { isFoodOpening } from "./lib/normalize";
const tests = [
  "令和8年度越谷市省エネ家電買換促進補助金 受付終了のお知らせ",
  "不審者情報",
  "講座「育児期ママのためのマネープラン講座」参加者募集中",
  "【開店】メニューいろいろ！立川駅南口の『ラーメン赤豚』で「旨辛つけ麺」食べてみた",
];
for (const t of tests) {
  console.log(isFoodOpening(t, ""), "|", t);
}
