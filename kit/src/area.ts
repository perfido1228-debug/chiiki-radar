// 対象の地域（config/area.json）と、全国の市区町村一覧（masters/japan-municipalities.json）。
//
// config/area.json の形:
//   { "name": "札幌", "areas": [ { "pref": "北海道", "cities": ["札幌市", "江別市"] } ] }
//   cities が空なら都道府県の全体。政令市は「札幌市」（全区）でも「札幌市中央区」（区だけ）でもよい。
import { existsSync, readFileSync, writeFileSync } from "fs";
import { P } from "./paths";

export type AreaPart = { pref: string; cities: string[] };
export type AreaConfig = { name: string; areas: AreaPart[] };

let masterCache: Record<string, string[]> | null = null;

export function loadMaster(): Record<string, string[]> {
  if (!masterCache) {
    const j = JSON.parse(readFileSync(P.masters("japan-municipalities.json"), "utf8")) as { prefectures: Record<string, string[]> };
    masterCache = j.prefectures;
  }
  return masterCache;
}

export function loadArea(): AreaConfig | null {
  const file = P.config("area.json");
  if (!existsSync(file)) return null;
  const a = JSON.parse(readFileSync(file, "utf8")) as Partial<AreaConfig>;
  const areas = (a.areas ?? [])
    .filter((x) => x && typeof x.pref === "string" && x.pref)
    .map((x) => ({ pref: x.pref, cities: Array.isArray(x.cities) ? x.cities : [] }));
  if (!areas.length) return null;
  return { name: a.name || areas.map((x) => x.pref).join("・"), areas };
}

export function saveArea(area: AreaConfig): void {
  writeFileSync(P.config("area.json"), JSON.stringify(area, null, 2) + "\n");
}

// 政令指定都市（区のある市）の一覧
export function designatedCities(master: Record<string, string[]>): string[] {
  const set = new Set<string>();
  for (const list of Object.values(master)) {
    for (const c of list) {
      const m = c.match(/^(.+?市)(.+区)$/);
      if (m) set.add(m[1]);
    }
  }
  return [...set];
}

// 設定に使える市区町村名か（一覧にある名前、または政令市の市名）
export function isValidCity(master: Record<string, string[]>, pref: string, city: string): boolean {
  const list = master[pref] ?? [];
  return list.includes(city) || list.some((c) => c.startsWith(city) && /^.+?市$/.test(city) && /区$/.test(c));
}

// 店がこの地域に入るか。市区町村を選んでいる場合はその市区町村だけ（政令市は市を選べば全区。
// 区を選んでいて店の区が分からない場合は入れる）
export function inArea(area: AreaConfig, pref: string, city: string): boolean {
  const part = area.areas.find((x) => x.pref === pref);
  if (!part) return false;
  if (!part.cities.length) return true;
  if (!city) return false;
  return part.cities.some((c) => city === c || city.startsWith(c) || c.startsWith(city));
}
