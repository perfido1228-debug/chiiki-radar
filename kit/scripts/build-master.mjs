// 全国の市区町村一覧（キットの masters/japan-municipalities.json）を作る。
// 出典: Geolonia「住所データ」(https://github.com/geolonia/japanese-addresses, CC BY 4.0) の api/ja.json。
// 本番の web/scripts/lib/municipalities.ts と同じ補正（鎌ケ谷市・袖ケ浦市を公式表記に、東京都利島村を補記）をする。
// 使い方: node kit/scripts/build-master.mjs
import { writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const res = await fetch("https://geolonia.github.io/japanese-addresses/api/ja.json");
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const ja = await res.json();

const FIX = { "鎌ヶ谷市": "鎌ケ谷市", "袖ヶ浦市": "袖ケ浦市" };
const prefectures = {};
for (const [pref, cities] of Object.entries(ja)) {
  const list = cities.map((c) => FIX[c] ?? c);
  if (pref === "東京都" && !list.includes("利島村")) list.push("利島村");
  prefectures[pref] = list;
}

const out = {
  source: "Geolonia 住所データ (https://github.com/geolonia/japanese-addresses) CC BY 4.0。鎌ケ谷市・袖ケ浦市を公式表記に補正、東京都利島村を補記",
  generatedAt: new Date().toISOString().slice(0, 10),
  prefectures,
};
const file = join(here, "..", "masters", "japan-municipalities.json");
writeFileSync(file, JSON.stringify(out));
const n = Object.values(prefectures).reduce((a, l) => a + l.length, 0);
console.log(`${file}: ${Object.keys(prefectures).length} 都道府県 / ${n} 市区町村`);
