// 対象の地域を見る・決める（config/area.json）。
// 使い方:
//   node tools/area.mjs show
//   node tools/area.mjs cities 北海道                         … その都道府県の市区町村の一覧（選ぶときの参考）
//   node tools/area.mjs set --name 札幌 --area 北海道:札幌市,江別市 [--area 宮城県:]
//       --area は「都道府県:市区町村,市区町村」。市区町村を書かなければ都道府県の全体。
//       政令市は「札幌市」（全区）でも「札幌市中央区」（区だけ）でもよい。
import { mkdirSync } from "fs";
import { isValidCity, loadArea, loadMaster, saveArea, type AreaPart } from "../src/area";
import { P } from "../src/paths";

const [cmd, ...rest] = process.argv.slice(2);
const master = loadMaster();

function argAll(name: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < rest.length; i++) if (rest[i] === name && rest[i + 1]) out.push(rest[++i]);
  return out;
}
function arg(name: string): string | undefined {
  return argAll(name)[0];
}

if (cmd === "show" || !cmd) {
  const a = loadArea();
  if (!a) console.log("まだ地域が設定されていません。");
  else {
    console.log(`名前: ${a.name}`);
    for (const p of a.areas) console.log(`- ${p.pref}: ${p.cities.length ? p.cities.join("、") : "（全体）"}`);
  }
} else if (cmd === "cities") {
  const pref = rest[0];
  if (!pref || !master[pref]) {
    console.error(`都道府県名を正しく書いてください（例: 北海道、東京都、大阪府、福岡県）`);
    process.exit(1);
  }
  const list = master[pref];
  const designated = [...new Set(list.map((c) => c.match(/^(.+?市).+区$/)?.[1]).filter(Boolean))];
  console.log(`${pref}: ${list.length} 市区町村${designated.length ? `（政令市: ${designated.join("、")}。市名だけ書けば全区）` : ""}`);
  console.log(list.join("、"));
} else if (cmd === "set") {
  const parts: AreaPart[] = [];
  const errors: string[] = [];
  for (const spec of argAll("--area")) {
    const [pref, citiesStr = ""] = spec.split(/[:：]/);
    if (!master[pref]) {
      errors.push(`都道府県が見つかりません: ${pref}`);
      continue;
    }
    const cities = citiesStr.split(/[,、，]/).map((s) => s.trim()).filter(Boolean);
    for (const c of cities) {
      if (!isValidCity(master, pref, c)) {
        const near = master[pref].filter((x) => x.includes(c.replace(/[市区町村]$/, ""))).slice(0, 5);
        errors.push(`${pref} に「${c}」が見つかりません${near.length ? `（似た名前: ${near.join("、")}）` : ""}`);
      }
    }
    parts.push({ pref, cities });
  }
  if (!parts.length) errors.push("--area を1つ以上書いてください（例: --area 北海道:札幌市,江別市）");
  if (errors.length) {
    for (const e of errors) console.error(e);
    process.exit(1);
  }
  mkdirSync(P.config(""), { recursive: true });
  const name = arg("--name") || parts.map((p) => (p.cities.length ? p.cities.join("・") : p.pref)).join("・");
  saveArea({ name, areas: parts });
  console.log(`地域を保存しました（config/area.json）: ${name}`);
  for (const p of parts) console.log(`- ${p.pref}: ${p.cities.length ? p.cities.join("、") : "（全体）"}`);
} else {
  console.error("使い方: node tools/area.mjs show | cities <都道府県> | set --name <名前> --area <都道府県:市区町村,…>");
  process.exit(1);
}
