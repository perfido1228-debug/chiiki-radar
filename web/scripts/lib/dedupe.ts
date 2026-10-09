// 同じ店の記事を1件にまとめるかどうかの判断。
// 方針（2026-10-08 確定）: まとめるのは「同じ市区町村の中で店名が同じ」場合と
// 「電話番号が同じで店名も同じ店と言える」場合だけ。確実でないものはまとめずに
// 「重複の可能性あり」の印を付けて両方表示する（取りこぼし防止を優先）。
// 別の市区町村の同名店（チェーンの別店舗）は別の店として扱う。
import { sb } from "./supabase";
import { nameKey, namesCompatible } from "./normalize";

export type StoreCandidate = {
  name: string;
  name_normalized: string;
  addr_normalized: string | null;
  tel_normalized: string | null;
  pref: string;
  city: string;
};

export type StoreLite = { id: number; name: string; pref: string; city: string };

export type DedupeResult =
  | { type: "hard_match"; storeId: number }
  | { type: "soft_match"; storeId: number }
  | { type: "new" };

const DESIGNATED_CITIES = ["さいたま市", "千葉市", "横浜市", "川崎市", "相模原市", "名古屋市", "京都市", "大阪市", "堺市"];

// 政令市の区は市名までに丸める（「大阪市北区」と「大阪市」を同じ市として比べるため）
export function municipalityBase(city: string): string {
  return DESIGNATED_CITIES.find((dc) => city.startsWith(dc)) ?? city;
}

// 同じ市区町村か（「大阪市」と「大阪市北区」のように、区まで分かっている側と分かっていない側も同じとみなす）
export function sameMunicipality(aPref: string, aCity: string, bPref: string, bCity: string): boolean {
  if (aPref !== bPref || !aCity || !bCity) return false;
  return aCity === bCity || aCity.startsWith(bCity) || bCity.startsWith(aCity);
}

// DBを引かずに判断する部分（クロールとデータ修復で共通）
// telMatches: 同じ電話番号の店 / localStores: 同じ市区町村（政令市は市全体）の店 / prefSameName: 同じ都府県で店名が同じ店
export function decideMatch(
  c: StoreCandidate,
  telMatches: StoreLite[],
  localStores: StoreLite[],
  prefSameName: StoreLite[],
): DedupeResult {
  let soft: number | null = null;

  // 1) 電話番号が同じで、店名も同じ店と言える → 同じ店（移転で住所が変わっていても）
  for (const s of telMatches) {
    if (namesCompatible(c.name, s.name)) return { type: "hard_match", storeId: s.id };
    soft ??= s.id; // 電話が同じでも店名がまったく違う → まとめずに印だけ
  }

  // 2) 同じ市区町村で店名が同じ（表記ゆれを除いて一致）→ 同じ店
  const key = nameKey(c.name);
  const local = localStores.filter((s) => sameMunicipality(c.pref, c.city, s.pref, s.city));
  if (key.length >= 2) {
    const same = local.find((s) => nameKey(s.name) === key);
    if (same) return { type: "hard_match", storeId: same.id };
  }

  // 3) 同じ市区町村に似た店名（支店名の有無など）→ まとめずに印だけ
  if (soft === null) {
    const similar = local.find((s) => namesCompatible(c.name, s.name));
    if (similar) soft = similar.id;
  }

  // 4) 同じ都府県の別の市区町村に同名店 → チェーンの別店舗の可能性。別の店として印だけ
  if (soft === null) {
    const other = prefSameName.find((s) => !sameMunicipality(c.pref, c.city, s.pref, s.city));
    if (other) soft = other.id;
  }

  return soft === null ? { type: "new" } : { type: "soft_match", storeId: soft };
}

export async function findExistingStore(c: StoreCandidate): Promise<DedupeResult> {
  let telMatches: StoreLite[] = [];
  if (c.tel_normalized) {
    const { data, error } = await sb
      .from("stores")
      .select("id, name, pref, city")
      .eq("tel_normalized", c.tel_normalized)
      .limit(20);
    if (error) throw error;
    telMatches = (data ?? []) as StoreLite[];
  }

  const base = municipalityBase(c.city);
  let q = sb.from("stores").select("id, name, pref, city").eq("pref", c.pref);
  q = base !== c.city || DESIGNATED_CITIES.includes(c.city) ? q.like("city", `${base}%`) : q.eq("city", c.city);
  const { data: near, error: nearErr } = await q.order("id", { ascending: false }).limit(2000);
  if (nearErr) throw nearErr;

  const { data: sameName, error: snErr } = await sb
    .from("stores")
    .select("id, name, pref, city")
    .eq("pref", c.pref)
    .eq("name_normalized", c.name_normalized)
    .limit(20);
  if (snErr) throw snErr;

  return decideMatch(c, telMatches, (near ?? []) as StoreLite[], (sameName ?? []) as StoreLite[]);
}
