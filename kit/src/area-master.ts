// 配布キット用の「対象の都府県・市区町村の一覧」。
// 本番の web/scripts/lib/municipalities.ts の代わりにビルドで差し替えられ、読み取りルール（normalize.ts）と
// 重複判定（dedupe.ts）は、設定した地域（config/area.json）を対象として動く。
import { designatedCities, loadArea, loadMaster } from "./area";

const master = loadMaster();
const area = loadArea();
if (!area) {
  console.error("地域が設定されていません（config/area.json）。はじめに.txt の手順で、Claude に設定を頼んでください。");
  process.exit(1);
}

export const PREFS: readonly string[] = area.areas.map((a) => a.pref).filter((p) => master[p]);
export const MUNICIPALITIES: Record<string, string[]> = Object.fromEntries(PREFS.map((p) => [p, master[p]]));
// 全国の政令市（区まで扱う）
export const DESIGNATED_CITIES: string[] = designatedCities(master);
export const OTHER_PREFS: string[] = Object.keys(master).filter((p) => !PREFS.includes(p));

// 対象外の道府県の市区町村名（政令市は市名のみ、郡部は郡名を省いた町村名）。対象の地域に同名があるものは除く
const short = (c: string) => c.replace(/^(.+?市).+区$/, "$1").replace(/^.+?郡(.+[町村])$/, "$1");
const inside = new Set(PREFS.flatMap((p) => master[p].flatMap((c) => [c, short(c)])));
export const OTHER_MUNICIPALITIES: string[] = [...new Set(OTHER_PREFS.flatMap((p) => master[p].map(short)))].filter((n) => !inside.has(n));
