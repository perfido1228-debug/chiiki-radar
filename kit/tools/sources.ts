// 情報源の一覧（config/sources.json）を見る・足す・止める。
// 使い方:
//   node tools/sources.mjs list
//   node tools/sources.mjs add --name <名前> --feed <フィードURL> --pref <都道府県> [--city <市区町村>] [--url <サイトURL>]
//                              [--type 号外NET|経済新聞|独立系ブログ] [--rules '<JSON>'] [--note <メモ>]
//   node tools/sources.mjs add-candidates c1,c5,c9       … tools/find-sources の候補（work/candidates.json）から足す
//   node tools/sources.mjs disable <番号> | enable <番号> | remove <番号>
// 足した情報源は、次の巡回で120日前まで遡って取り込まれる。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { isValidCity, loadMaster } from "../src/area";
import { P } from "../src/paths";

type Src = {
  id: number;
  name: string;
  url: string;
  rss_url: string;
  source_type: string;
  pref: string;
  city: string | null;
  enabled: boolean;
  rules?: Record<string, unknown>;
  note?: string;
};

const TYPES = ["号外NET", "経済新聞", "独立系ブログ", "つうしん系", "ku2shin系"];
const [cmd, ...rest] = process.argv.slice(2);
const master = loadMaster();
const file = P.config("sources.json");

function load(): Src[] {
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Src[]) : [];
}
function save(list: Src[]) {
  mkdirSync(P.config(""), { recursive: true });
  writeFileSync(file, JSON.stringify(list, null, 2) + "\n");
}
function arg(name: string): string | undefined {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
}
const sameFeed = (a: string, b: string) => a.replace(/\/+$/, "").toLowerCase() === b.replace(/\/+$/, "").toLowerCase();

function check(s: Omit<Src, "id">, list: Src[]): string[] {
  const errs: string[] = [];
  if (!s.name) errs.push("名前がありません");
  if (!/^https?:\/\//.test(s.rss_url)) errs.push(`フィードのURLが正しくありません: ${s.rss_url}`);
  if (!master[s.pref]) errs.push(`都道府県が見つかりません: ${s.pref}`);
  else if (s.city && !isValidCity(master, s.pref, s.city)) errs.push(`${s.pref} に「${s.city}」が見つかりません（tools/area.mjs cities ${s.pref} で確かめてください）`);
  if (!TYPES.includes(s.source_type)) errs.push(`種類は ${TYPES.join("・")} のどれか: ${s.source_type}`);
  const dup = list.find((x) => sameFeed(x.rss_url, s.rss_url) || x.url === s.url);
  if (dup) errs.push(`すでに登録されています: ${dup.id} ${dup.name}`);
  return errs;
}

function add(list: Src[], s: Omit<Src, "id">): Src | null {
  const errs = check(s, list);
  if (errs.length) {
    console.error(`× ${s.name || s.rss_url}: ${errs.join(" / ")}`);
    return null;
  }
  const id = list.reduce((m, x) => Math.max(m, x.id), 0) + 1;
  const row = { id, ...s };
  list.push(row);
  console.log(`○ ${id} ${s.name}（${s.pref}${s.city ?? ""}）${s.rss_url}`);
  return row;
}

const list = load();
switch (cmd) {
  case "list":
  case undefined: {
    if (!list.length) console.log("情報源はまだありません。");
    for (const s of list) console.log(`${String(s.id).padStart(3)} ${s.enabled ? "  " : "止"} ${s.name}（${s.pref}${s.city ?? ""}）${s.rss_url}${s.rules ? `  読み方:${JSON.stringify(s.rules)}` : ""}`);
    console.log(`計 ${list.length} 件（止めている ${list.filter((s) => !s.enabled).length} 件）`);
    break;
  }
  case "add": {
    const feed = arg("--feed") ?? "";
    const rules = arg("--rules");
    const s = {
      name: arg("--name") ?? "",
      url: arg("--url") ?? (feed ? new URL(feed).origin + "/" : ""),
      rss_url: feed,
      source_type: arg("--type") ?? "独立系ブログ",
      pref: arg("--pref") ?? "",
      city: arg("--city") ?? null,
      enabled: true,
      ...(rules ? { rules: JSON.parse(rules) } : {}),
      ...(arg("--note") ? { note: arg("--note") } : {}),
    };
    if (add(list, s)) save(list);
    else process.exit(1);
    break;
  }
  case "add-candidates": {
    const cfile = P.work("candidates.json");
    if (!existsSync(cfile)) {
      console.error("work/candidates.json がありません。先に node tools/find-sources.mjs を実行してください。");
      process.exit(1);
    }
    const cands = JSON.parse(readFileSync(cfile, "utf8")) as Array<{ id: string; name: string; site: string; feed: string; type: string; pref: string; city: string | null; rules?: Record<string, unknown> }>;
    const ids = (rest[0] ?? "").split(/[,、\s]+/).filter(Boolean);
    let n = 0;
    for (const id of ids) {
      const c = cands.find((x) => x.id === id);
      if (!c) {
        console.error(`× 候補 ${id} が見つかりません`);
        continue;
      }
      if (add(list, { name: c.name, url: c.site, rss_url: c.feed, source_type: c.type, pref: c.pref, city: c.city, enabled: true, ...(c.rules ? { rules: c.rules } : {}) })) n++;
    }
    save(list);
    console.log(`${n} 件を足しました（計 ${list.length} 件）`);
    break;
  }
  case "disable":
  case "enable":
  case "remove": {
    const id = Number(rest[0]);
    const s = list.find((x) => x.id === id);
    if (!s) {
      console.error(`番号 ${rest[0]} の情報源が見つかりません`);
      process.exit(1);
    }
    if (cmd === "remove") list.splice(list.indexOf(s), 1);
    else s.enabled = cmd === "enable";
    save(list);
    console.log(`${cmd === "remove" ? "消しました" : cmd === "enable" ? "動かします" : "止めました"}: ${s.id} ${s.name}`);
    break;
  }
  default:
    console.error("使い方: node tools/sources.mjs list | add ... | add-candidates c1,c2 | disable <番号> | enable <番号> | remove <番号>");
    process.exit(1);
}
