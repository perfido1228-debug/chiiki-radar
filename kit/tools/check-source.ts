// 情報源を登録せずに試し読みする（どんな店が取れるか・店名や場所を正しく読めるかを見る）。
// 本番と同じ読み取りで、過去120日分の記事を読み、取り込む候補を表示する（データは何も書き換えない）。
// 使い方:
//   node tools/check-source.mjs --feed <フィードURL> --pref <都道府県> [--city <市区町村>] [--name <名前>]
//                               [--pages 3] [--rules '<JSON>'] [--show-rejected]
//   node tools/check-source.mjs --candidate c12          … tools/find-sources の候補を試す
// 表示の見方: [取込候補] … 店として取り込む / [記事のみ] … 開店記事だが店にできない（理由つき）
//             --show-rejected を付けると、開店記事ではないと判断した見出しも理由つきで出す
import { spawn } from "child_process";
import { existsSync, readFileSync } from "fs";
import { P, KIT_ROOT } from "../src/paths";

const args = process.argv.slice(2);
const arg = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};

let src: { name: string; url: string; rss_url: string; pref: string; city: string | null; source_type: string; rules?: unknown } | null = null;
const candId = arg("--candidate");
if (candId) {
  const file = P.work("candidates.json");
  if (!existsSync(file)) {
    console.error("work/candidates.json がありません。先に node tools/find-sources.mjs を実行してください。");
    process.exit(1);
  }
  const c = (JSON.parse(readFileSync(file, "utf8")) as Array<Record<string, any>>).find((x) => x.id === candId); // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!c) {
    console.error(`候補 ${candId} が見つかりません`);
    process.exit(1);
  }
  src = { name: c.name, url: c.site, rss_url: c.feed, pref: c.pref, city: c.city ?? null, source_type: c.type, rules: c.rules };
} else {
  const feed = arg("--feed");
  const pref = arg("--pref");
  if (!feed || !pref) {
    console.error("使い方: node tools/check-source.mjs --feed <フィードURL> --pref <都道府県> [--city <市区町村>] [--name <名前>]");
    process.exit(1);
  }
  src = { name: arg("--name") ?? new URL(feed).host, url: new URL(feed).origin + "/", rss_url: feed, pref, city: arg("--city") ?? null, source_type: arg("--type") ?? "独立系ブログ" };
}
const rules = arg("--rules");
if (rules) src.rules = JSON.parse(rules);

// 巡回の「名前で絞る」機能で、この試し読み用の情報源だけを読む
const extra = { ...src, name: `試し読み:${src.name}` };
console.log(`試し読み: ${src.name}（${src.pref}${src.city ?? ""}） ${src.rss_url}`);
const child = spawn(
  process.execPath,
  [P.app("crawl.mjs"), "試し読み:", "--dry-run", `--max-pages=${arg("--pages") ?? 3}`, ...(args.includes("--show-rejected") ? ["--show-rejected"] : [])],
  { cwd: KIT_ROOT, env: { ...process.env, KIT_EXTRA_SOURCE: JSON.stringify(extra) }, stdio: "inherit" },
);
child.on("close", (code) => process.exit(code ?? 0));
