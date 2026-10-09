import { MUNICIPALITIES, OTHER_MUNICIPALITIES, OTHER_PREFS } from "./municipalities";

// 地域密着レーダー: 記事から店舗情報を読み取るためのルール集。
// クロール（crawl.ts）・データ修復・検証スクリプトで共通に使う。
// 方針: 誤った値を入れるより空欄のほうが安全（迷ったら null を返す）。

// ============================================================
// 文字の正規化
// ============================================================
const ZEN_HAN: Record<string, string> = {
  "０": "0", "１": "1", "２": "2", "３": "3", "４": "4",
  "５": "5", "６": "6", "７": "7", "８": "8", "９": "9",
  "Ａ": "A", "Ｂ": "B", "Ｃ": "C", "Ｄ": "D", "Ｅ": "E",
  "Ｆ": "F", "Ｇ": "G", "Ｈ": "H", "Ｉ": "I", "Ｊ": "J",
  "Ｋ": "K", "Ｌ": "L", "Ｍ": "M", "Ｎ": "N", "Ｏ": "O",
  "Ｐ": "P", "Ｑ": "Q", "Ｒ": "R", "Ｓ": "S", "Ｔ": "T",
  "Ｕ": "U", "Ｖ": "V", "Ｗ": "W", "Ｘ": "X", "Ｙ": "Y", "Ｚ": "Z",
  "ａ": "a", "ｂ": "b", "ｃ": "c", "ｄ": "d", "ｅ": "e",
  "ｆ": "f", "ｇ": "g", "ｈ": "h", "ｉ": "i", "ｊ": "j",
  "ｋ": "k", "ｌ": "l", "ｍ": "m", "ｎ": "n", "ｏ": "o",
  "ｐ": "p", "ｑ": "q", "ｒ": "r", "ｓ": "s", "ｔ": "t",
  "ｕ": "u", "ｖ": "v", "ｗ": "w", "ｘ": "x", "ｙ": "y", "ｚ": "z",
  "－": "-", "―": "-", "　": " ",
  // 注: 長音符「ー」(U+30FC) は仮名の一部なので変換しない。
  // 「ラーメン」→「ラ-メン」のような店名破壊を防ぐ。
  // 住所のハイフン正規化は normalizeAddress 側で個別に「ー」→「-」を行う。
};

// ゼロ幅スペース・BOM などの見えない文字（U+200B〜U+200D, U+2060, U+FEFF）
const INVISIBLE_RE = new RegExp("[" + String.fromCharCode(0x200b) + "-" + String.fromCharCode(0x200d) + String.fromCharCode(0x2060) + String.fromCharCode(0xfeff) + "]", "g");

export function normalizeText(s: string | null | undefined): string {
  if (!s) return "";
  let out = "";
  // ゼロ幅スペース等の見えない文字は取り除く（見出し先頭の【市区町村】が読めなくなるため）
  for (const ch of s.replace(INVISIBLE_RE, "")) out += ZEN_HAN[ch] ?? ch;
  return out.trim().replace(/\s+/g, " ");
}

export function normalizeStoreName(name: string): string {
  return normalizeText(name)
    .replace(/[（(].*?[)）]/g, "")
    .replace(/株式会社|有限会社|合同会社/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

export function normalizeAddress(addr: string): string {
  return normalizeText(addr)
    .replace(/\s+/g, "")
    .replace(/[‐－−ー―]/g, "-");
}

// ============================================================
// 記事本文の整理
// ============================================================
// サイト共通のフッター（運営会社・著作権表示など）には運営会社の電話番号や住所が並ぶ。
// ページの後半にある場合だけ、その目印より後ろを切り落とす。
// （「あわせて読みたい」「関連記事」等は記事の途中にも出てくるので切る目印にしない）
const FOOTER_MARKERS = [
  "運営会社", "プライバシーポリシー", "利用規約", "Copyright", "COPYRIGHT", "copyright",
  "All Rights Reserved", "All rights reserved", "今この記事も読まれています",
];

export function trimBoilerplate(text: string): string {
  let cut = text.length;
  const half = Math.floor(text.length / 2);
  for (const m of FOOTER_MARKERS) {
    const i = text.indexOf(m, half);
    if (i !== -1 && i < cut) cut = i;
  }
  return text.slice(0, cut);
}

// サイトの運営者・広告窓口などの連絡先の直前に出る語（ここに続く電話・住所は店のものではない）
const OPERATOR_CONTEXT_RE = /(?:運営会社|運営者|運営元|会社概要|編集部|広告掲載|広告のお問い?合わせ|プライバシー|利用規約|Copyright|©)/;

// ============================================================
// 都府県・市区町村
// ============================================================
export const PREFS = ["東京都", "神奈川県", "千葉県", "埼玉県", "愛知県", "大阪府", "京都府"] as const;
export type Pref = (typeof PREFS)[number];
const PREF_ALT = PREFS.join("|");

export function extractPref(text: string): Pref | null {
  let best: Pref | null = null;
  let bestIdx = Infinity;
  for (const p of PREFS) {
    const i = text.indexOf(p);
    if (i !== -1 && i < bestIdx) { best = p; bestIdx = i; }
  }
  return best;
}

// 政令指定都市は区まで扱う
const DESIGNATED_CITIES = ["さいたま市", "千葉市", "横浜市", "川崎市", "相模原市", "名古屋市", "京都市", "大阪市", "堺市"];
// 市区町村名に使われうる文字（数字・区切り記号・括弧・空白を除く）
const NAME_CH = "[^\\s0-9、。,，・（）()「」『』【】\\-－−ー―‐]";
// 住所の候補を探すための大まかな形（正しい市区町村かどうかは一覧で確かめる）
const MUNI_ALT =
  `(?:${DESIGNATED_CITIES.join("|")})(?:${NAME_CH}{1,4}?区)?` +
  `|${NAME_CH}{1,5}?郡${NAME_CH}{1,5}?[町村]` +
  `|${NAME_CH}{1,7}?[市区町村]`;

// 「鎌ケ谷市」「鎌ヶ谷市」のような表記ゆれを吸収した照合用の形
const kanaKey = (s: string) => s.replace(/ヶ/g, "ケ").replace(/ヵ/g, "カ");

type MuniEntry = { pref: Pref; key: string; city: string };
const MUNI_INDEX: MuniEntry[] = [];
const WARD_INDEX: Record<string, Record<string, string[]>> = {};
for (const pref of PREFS) {
  WARD_INDEX[pref] = {};
  for (const city of MUNICIPALITIES[pref] ?? []) {
    MUNI_INDEX.push({ pref, key: kanaKey(city), city });
    // 郡を省いた書き方（「入間郡三芳町」→「三芳町」）
    const gun = city.match(/^.+?郡(.+[町村])$/);
    if (gun) MUNI_INDEX.push({ pref, key: kanaKey(gun[1]), city });
    // 政令市の区（「大阪市北区」→ 区名「北区」）
    const ward = city.match(/^(.+?市)(.+区)$/);
    if (ward && DESIGNATED_CITIES.includes(ward[1])) (WARD_INDEX[pref][ward[2]] ??= []).push(city);
  }
  // 区が書かれていない政令市
  for (const dc of DESIGNATED_CITIES) {
    if ((MUNICIPALITIES[pref] ?? []).some((c) => c.startsWith(dc))) MUNI_INDEX.push({ pref, key: dc, city: dc });
  }
}
MUNI_INDEX.sort((a, b) => b.key.length - a.key.length);
const OTHER_MUNI_SET = new Set(OTHER_MUNICIPALITIES);

// 文字列の先頭にある市区町村名を一覧から探す（都府県名の直後の部分を渡す）
function matchMunicipalityAt(rest: string, pref: Pref, hintCity?: string | null): string | null {
  const r = kanaKey(rest);
  for (const e of MUNI_INDEX) {
    if (e.pref === pref && r.startsWith(e.key)) {
      // 政令市名だけが一致した場合でも、続きに区名があれば区まで特定する
      if (DESIGNATED_CITIES.includes(e.city)) {
        const ward = r.slice(e.key.length).match(/^(.{1,4}?区)/);
        if (ward && (MUNICIPALITIES[pref] ?? []).includes(e.city + ward[1])) return e.city + ward[1];
      }
      return e.city;
    }
  }
  // 政令市名を省いて区名だけ書かれている（「神奈川県中原区…」）
  const ward = r.match(/^(.{1,4}?区)/);
  if (ward) {
    const cands = WARD_INDEX[pref]?.[ward[1]] ?? [];
    if (cands.length === 1) return cands[0];
    if (hintCity) {
      const hit = cands.find((c) => c.startsWith(hintCity) || hintCity.startsWith(c));
      if (hit) return hit;
    }
  }
  return null;
}

export function extractCity(addr: string, pref: Pref, hintCity?: string | null): string | null {
  const a = normalizeText(addr).replace(/\s+/g, "");
  const idx = a.indexOf(pref);
  if (idx === -1) return null;
  return matchMunicipalityAt(a.slice(idx + pref.length), pref, hintCity);
}

// 実在する市区町村名（一覧にある名前）か
export function isKnownCity(pref: string, city: string): boolean {
  if (!(PREFS as readonly string[]).includes(pref) || !city) return false;
  return matchMunicipalityAt(city, pref as Pref) === city;
}

// 都府県名なしで書かれた市区町村名から、対象7都府県のどこかを判定する（候補が1つに決まる場合のみ）
function prefOfLocalName(text: string, preferred?: Pref | null): Pref | null {
  if (preferred && matchMunicipalityAt(text, preferred)) return preferred;
  const hits = new Set<Pref>();
  for (const p of PREFS) if (matchMunicipalityAt(text, p)) hits.add(p);
  return hits.size === 1 ? [...hits][0] : null;
}

// 見出しの【○○市】【横浜市港南区】のような地域タグから市区町村を読む
export function cityFromTitleTag(
  title: string,
  preferredPref?: Pref | null,
  hintCity?: string | null,
): { pref: Pref; city: string } | null {
  const m = normalizeText(title).match(/^\s*【([^】]{2,20})】/);
  if (!m) return null;
  let tag = m[1].replace(/(?:周辺|エリア|近辺|付近|界隈)$/, "").split(/[・、,／/]/)[0].trim();
  let pref: Pref | null = extractPref(tag);
  if (pref && tag.startsWith(pref)) tag = tag.slice(pref.length);
  if (!pref) pref = prefOfLocalName(tag, preferredPref);
  if (!pref) return null;
  const city = matchMunicipalityAt(tag, pref, hintCity);
  if (!city) return null;
  // タグ全体が市区町村名である場合だけ採用（【池袋西口】【大阪新店】などは使わない）
  const tk = kanaKey(tag);
  const ck = kanaKey(city);
  const plain = ck.replace(/^.+?郡/, "");
  if (tk !== ck && tk !== plain && !ck.endsWith(tk)) return null;
  return { pref, city };
}

// 文中に出てくる市区町村名（1つに決まる場合だけ）を返す。住所が書かれていない記事の場所決めに使う
// （「北区」「港区」のような2文字の名前は誤読しやすいので数えない）
export function cityMentioned(text: string, preferredPref?: Pref | null): { pref: Pref; city: string } | null {
  let t = kanaKey(normalizeText(text));
  for (const p of PREFS) t = t.split(p).join(" ");
  const found = new Map<string, Pref>();
  // 情報源の都府県に政令市の区として同じ名前がある場合は、そちらとして読む（千葉の記事の「中央区」→千葉市中央区）
  if (preferredPref) {
    for (const [ward, cities] of Object.entries(WARD_INDEX[preferredPref] ?? {})) {
      if (cities.length !== 1 || ward.length < 2) continue;
      const i = t.indexOf(ward);
      if (i !== -1 && !(i > 0 && /[一-龥々ァ-ヶ]/.test(t[i - 1]))) found.set(cities[0], preferredPref);
    }
  }
  for (const e of MUNI_INDEX) {
    if (e.key.length < 3) continue;
    // 情報源の都府県で区として読んだ名前は、他の都府県の同名（東京都中央区など）として数えない
    if (preferredPref && e.pref !== preferredPref && WARD_INDEX[preferredPref]?.[e.key]?.length === 1) continue;
    let from = 0;
    for (;;) {
      const i = t.indexOf(e.key, from);
      if (i === -1) break;
      from = i + 1;
      // 前に漢字・カナが続く場合は別の地名の一部（「大和市」⊂「東大和市」など）
      if (i > 0 && /[一-龥々ァ-ヶ]/.test(t[i - 1])) continue;
      found.set(e.city, e.pref);
      break;
    }
  }
  // 政令市名だけのもの（横浜市）と区まであるもの（横浜市中区）が両方ある場合は区の方を残す
  for (const c of [...found.keys()]) {
    if ([...found.keys()].some((x) => x !== c && x.startsWith(c))) found.delete(c);
  }
  if (found.size !== 1) return null;
  const [city, pref] = [...found.entries()][0];
  return { pref, city };
}

// 対象外の道府県の店らしいか（記事中の住所・地域タグで判定）
const OTHER_PREF_ADDRESS_RE = new RegExp(`(?:${OTHER_PREFS.join("|")})${NAME_CH}{1,8}?[市区町村郡]${NAME_CH}{0,12}?[0-9]`);
export function looksOutOfArea(title: string, text: string): boolean {
  const t = normalizeText(title);
  const tag = t.match(/^\s*【([^】]{2,20})】/);
  if (tag) {
    const name = tag[1].split(/[・、,／/]/)[0].replace(/(?:周辺|エリア)$/, "");
    if (OTHER_PREFS.some((p) => name.startsWith(p))) return true;
    if (OTHER_MUNI_SET.has(name)) return true;
  }
  return OTHER_PREF_ADDRESS_RE.test(`${t} ${normalizeText(text)}`);
}

// ============================================================
// 住所
// ============================================================
const ADDRESS_LABEL_RE = /(?:住所|所在地|場所|Address|ADDRESS|店舗情報)\s*[:：は]?\s*(?:〒?\s*\d{3}-?\d{4}\s*)?/g;
const ADDRESS_FULL_G = new RegExp(`((?:${PREF_ALT})(?:${MUNI_ALT})[^\\s、。，,]{0,40})`, "g");
const ADDRESS_FULL_HEAD = new RegExp(`^((?:${PREF_ALT})(?:${MUNI_ALT})[^\\s、。，,]{0,40})`);
const TOWN = "[一-龥々ヶケぁ-んァ-ヶ]{1,10}?";
const ADDR_NUM = "(?:[0-9]+丁目[0-9]*(?:[-－−ー―‐][0-9]+)*|[0-9]+(?:[-－−ー―‐][0-9]+)+|[0-9]+番地?[0-9]*号?)";
const LOCAL_ADDRESS_HEAD = new RegExp(`^((?:${MUNI_ALT})${TOWN}${ADDR_NUM}[^\\s、。，,]{0,20})`);
const CITY_ADDRESS_G = new RegExp(`(?<![一-龥々ヶ])((?:${MUNI_ALT})${TOWN}${ADDR_NUM}[^\\s、。，,]{0,20})`, "g");

// 住所の後ろに続きがちな説明文・注記を切り落とす
function cleanAddress(addr: string): string {
  return normalizeText(addr)
    .replace(/\s*[※（(【\[<＜「『●■★☆◆→⇒」』）)].*$/, "")
    .replace(/(?<=[0-9])(?:[月火水木金土日](?:・|曜)|平日|土日|祝).*$/, "")
    .replace(/(?:にある|にて|に位置|で営業|から徒歩|徒歩|最寄り?|営業時間|営業|定休日|TEL|Tel|電話|アクセス|地図|MAP|Map|Google|グーグル|駐車場|座席|席数|URL|公式|今この記事|こちら|です|でした|となり|オープン|OPEN|Instagram|instagram|HP|に由来|応援|お願い|ください|募集|登録|詳しく|記事|求人|掲載|予約).*$/, "")
    .replace(/(?:に|で|が|は|の|を|へ|と)(?:オープン|開店|新規|移転|誕生|登場|出店|ある|あった).*$/, "")
    .replace(/[・、。,，\s]+$/, "")
    .replace(/(?:に|で|が|は|の|を|へ|と)$/, "")
    .trim();
}

// 実在の市区町村の後ろに番地らしき数字があり、文章の誤読でないものだけを住所とみなす
function isPlausibleAddress(a: string): boolean {
  if (a.length < 8 || a.length > 70) return false;
  const pref = extractPref(a);
  if (!pref || !a.startsWith(pref)) return false;
  const city = extractCity(a, pref);
  if (!city) return false;
  const afterPref = kanaKey(a.slice(pref.length));
  const cityText = kanaKey(city);
  const plain = cityText.replace(/^.+?郡/, "");
  let rest = afterPref;
  if (afterPref.startsWith(cityText)) rest = afterPref.slice(cityText.length);
  else if (afterPref.startsWith(plain)) rest = afterPref.slice(plain.length);
  if (!/[0-9]/.test(rest) && !/丁目|番地/.test(rest)) return false;
  if (/^[営立内民役]/.test(rest)) return false;
  if (/(?:を中心|店舗|ほか|など|にある|では|には|から|まで|以内|内に|内で|全域|各地|駅|出口)/.test(rest.slice(0, 14))) return false;
  return true;
}

// 都府県名のない「○○市△△1-2-3」に、市区町村から割り出した都府県名を付ける
function withPref(local: string, fallbackPref: Pref): string | null {
  const pref = prefOfLocalName(local, fallbackPref);
  return pref ? pref + local : null;
}

export function extractAddress(text: string, fallbackPref?: Pref): string | null {
  // 全角数字（４５−２等）を含む住所を取りこぼさないよう先に正規化する
  const t = normalizeText(text);
  type Cand = { addr: string; score: number; pos: number };
  const cands: Cand[] = [];
  const consider = (raw: string | null, pos: number, bonus: number) => {
    if (!raw) return;
    const a = cleanAddress(raw);
    if (!isPlausibleAddress(a)) return;
    // 運営会社の所在地など、サイト側の連絡先は除く
    if (OPERATOR_CONTEXT_RE.test(t.slice(Math.max(0, pos - 40), pos))) return;
    const groups = Math.min((a.match(/[0-9]+/g) ?? []).length, 4);
    cands.push({ addr: a, score: bonus + groups * 2 + (/丁目|番地|号/.test(a) ? 1 : 0), pos });
  };

  // 1) 「住所：」などの見出しの直後（最優先）
  for (const m of t.matchAll(ADDRESS_LABEL_RE)) {
    const from = (m.index ?? 0) + m[0].length;
    const after = t.slice(from, from + 80);
    const full = after.match(ADDRESS_FULL_HEAD);
    if (full) consider(full[1], from, 10);
    else if (fallbackPref) {
      const local = after.match(LOCAL_ADDRESS_HEAD);
      if (local) consider(withPref(local[1], fallbackPref), from, 9);
    }
  }
  // 2) 都府県から書かれた住所
  for (const m of t.matchAll(ADDRESS_FULL_G)) consider(m[1], m.index ?? 0, 0);
  // 3) 都府県が省略された「○○市△△1-2-3」形式（市区町村の一覧から都府県を補う）
  if (fallbackPref) {
    for (const m of t.matchAll(CITY_ADDRESS_G)) consider(withPref(m[1], fallbackPref), m.index ?? 0, -1);
  }
  cands.sort((a, b) => b.score - a.score || a.pos - b.pos);
  return cands[0]?.addr ?? null;
}

// ============================================================
// 電話番号
// ============================================================
// 日本の電話番号として成り立つ桁数・先頭番号か
export function isValidJpPhone(d: string): boolean {
  if (!/^0[0-9]+$/.test(d) || d.startsWith("00")) return false;
  if (d.length === 11) return /^(?:050|070|080|090|0800)/.test(d);
  if (d.length === 10) return !/^(?:050|070|080|090|0800)/.test(d);
  return false;
}

export function normalizeTel(tel: string | null | undefined): string | null {
  if (!tel) return null;
  const digits = normalizeText(tel).replace(/[^\d]/g, "");
  return isValidJpPhone(digits) ? digits : null;
}

const TEL_CONTEXT_RE = /(?:TEL|Tel|tel|電話|☎|📞|℡|お問い?合わせ|問合せ|予約)/;
// 前後が数字・英字・URL記号でない数字列だけを電話番号の候補にする
// （画像ファイル名「2020080203-110x110.png」等の一部を拾わない）
const TEL_CANDIDATE_G = /(?<![0-9\/.\-_=?&#%a-zA-Z])(\(?0[0-9]{1,4}\)?[-−－ー―‐‑ (（)）]{0,2}[0-9]{1,4}[-−－ー―‐‑ (（)）]{0,2}[0-9]{3,4})(?![0-9\/_=.a-zA-Z%]|-[0-9])/g;

export function extractTel(text: string): string | null {
  const t = normalizeText(text).replace(/(TEL|Tel|tel|電話番号|電話|☎|📞|℡)\s*[:：.]?\s*/g, "$1 ");
  let fallback: string | null = null;
  for (const m of t.matchAll(TEL_CANDIDATE_G)) {
    const raw = m[1];
    const digits = raw.replace(/[^\d]/g, "");
    if (!isValidJpPhone(digits)) continue;
    const before = t.slice(Math.max(0, (m.index ?? 0) - 12), m.index ?? 0);
    if (OPERATOR_CONTEXT_RE.test(t.slice(Math.max(0, (m.index ?? 0) - 40), m.index ?? 0))) continue;
    const hasContext = TEL_CONTEXT_RE.test(before);
    const hasSeparator = /[^\d]/.test(raw);
    if (hasContext) return digits;
    // 区切りのない数字だけの並びは、電話の見出しがある場合だけ採用する
    if (hasSeparator && !fallback) fallback = digits;
  }
  return fallback;
}

// ============================================================
// オープン日
// ============================================================
const DOW = "(?:\\s*[（(][月火水木金土日祝・]{1,3}[）)])?";
const TIME = "(?:\\s*(?:午前|午後|朝|昼|夜)?\\s*[0-9]{1,2}(?:[:：][0-9]{2}|時(?:[0-9]{1,2}分|半)?)\\s*(?:頃|ごろ)?\\s*[～〜~]?)?";
const PRE_VERB = "(?:\\s*(?:に|より|から|には|の)?\\s*(?:いよいよ|ついに|待望の)?\\s*(?:正式|グランド|リニューアル|新規|プレ|移転|新装|ニュー|再)?\\s*)";
const OPEN_VERB = "(?:オープン|OPEN|Open|開店|開業|営業開始|NEW OPEN|New Open)";

type DateHit = { y?: number; m: number; d: number };

const OPEN_DATE_PATTERNS: Array<{ re: RegExp; pick: (m: RegExpMatchArray) => DateHit }> = [
  // 「オープン日：2026年10月9日」「開店日は10/9」
  {
    re: new RegExp(`(?:オープン日|開店日|開業日|オープン予定日|開店予定日|グランドオープン日|OPEN日|オープン日時)\\s*[:：は]?\\s*(?:([0-9]{4})年)?([0-9]{1,2})月([0-9]{1,2})日`, "g"),
    pick: (m) => ({ y: m[1] ? Number(m[1]) : undefined, m: Number(m[2]), d: Number(m[3]) }),
  },
  {
    re: new RegExp(`(?:オープン日|開店日|開業日|オープン予定日|開店予定日|グランドオープン日|OPEN日|オープン日時)\\s*[:：は]?\\s*(?:([0-9]{4})[\\/.])?([0-9]{1,2})[\\/.]([0-9]{1,2})(?![0-9])`, "g"),
    pick: (m) => ({ y: m[1] ? Number(m[1]) : undefined, m: Number(m[2]), d: Number(m[3]) }),
  },
  // 「2026年10月9日(金)11時にグランドオープン」
  {
    re: new RegExp(`([0-9]{4})[年\\/.\\-]([0-9]{1,2})[月\\/.\\-]([0-9]{1,2})日?${DOW}${TIME}${PRE_VERB}${OPEN_VERB}`, "g"),
    pick: (m) => ({ y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) }),
  },
  // 「10月9日(金)にオープン」
  {
    re: new RegExp(`(?<![0-9])([0-9]{1,2})月([0-9]{1,2})日${DOW}${TIME}${PRE_VERB}${OPEN_VERB}`, "g"),
    pick: (m) => ({ m: Number(m[1]), d: Number(m[2]) }),
  },
  // 「10/9(金)オープン」「【10/3OPEN】」
  {
    re: new RegExp(`(?<![0-9\\/])([0-9]{1,2})\\/([0-9]{1,2})(?![0-9\\/])${DOW}${TIME}${PRE_VERB}${OPEN_VERB}`, "g"),
    pick: (m) => ({ m: Number(m[1]), d: Number(m[2]) }),
  },
  // 見出しの先頭が日付で、その後にオープンの語が続く「10月9日（金）、荒川区内に○○がオープン」
  {
    re: new RegExp(`^(?:【[^】]*】)?\s*(?:([0-9]{4})年)?([0-9]{1,2})月([0-9]{1,2})日${DOW}[、,\s][^。！!]{0,60}?${OPEN_VERB}`, "g"),
    pick: (m) => ({ y: m[1] ? Number(m[1]) : undefined, m: Number(m[2]), d: Number(m[3]) }),
  },
  // 「グランドオープンは2026年10月9日」
  {
    re: new RegExp(`${OPEN_VERB}(?:日|予定日)?(?:は|が|：|:)\\s*(?:([0-9]{4})年)?([0-9]{1,2})月([0-9]{1,2})日`, "g"),
    pick: (m) => ({ y: m[1] ? Number(m[1]) : undefined, m: Number(m[2]), d: Number(m[3]) }),
  },
];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// 日本時間の日付（YYYY-MM-DD）
export function jstDateString(d: Date): string {
  const j = new Date(d.getTime() + 9 * 3600 * 1000);
  return `${j.getUTCFullYear()}-${pad2(j.getUTCMonth() + 1)}-${pad2(j.getUTCDate())}`;
}

function toValidDate(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

// articleDate: 記事の掲載日時（年が書かれていない日付の年を補うのに使う）
export function extractOpenDate(text: string, articleDate?: Date | number): string | null {
  const t = normalizeText(text);
  const ad = articleDate === undefined ? undefined : typeof articleDate === "number" ? new Date(Date.UTC(articleDate, 6, 1)) : articleDate;
  const aj = ad ? jstDateString(ad) : null;
  const ay = aj ? Number(aj.slice(0, 4)) : undefined;
  const am = aj ? Number(aj.slice(5, 7)) : undefined;

  for (const { re, pick } of OPEN_DATE_PATTERNS) {
    for (const m of t.matchAll(re)) {
      const hit = pick(m);
      let y = hit.y;
      if (y === undefined) {
        if (!ay || !am) continue;
        y = ay;
        // 11〜12月の記事で1〜3月のオープン → 翌年のこと
        if (am >= 11 && hit.m <= 3) y = ay + 1;
      } else if (ay && (y < ay - 1 || y > ay + 2)) {
        // 新規開店の記事なので、掲載年から大きく外れた年（無関係な過去の日付の誤取込）は棄却する。
        // 誤った開店日を出すより未設定のほうが安全。
        continue;
      }
      const v = toValidDate(y, hit.m, hit.d);
      if (v) return v;
    }
  }

  // 「本日オープン」「明日オープン」
  if (ad) {
    const rel = t.match(new RegExp(`(本日|今日|明日)${PRE_VERB}${OPEN_VERB}`));
    if (rel) {
      const base = new Date(ad.getTime() + (rel[1] === "明日" ? 86400000 : 0));
      return jstDateString(base);
    }
  }
  return null;
}

// ============================================================
// ジャンル
// ============================================================
// 見出しに含まれる語は上から順に優先する（より具体的な業態を先に置く）
const GENRE_KEYWORDS: Array<[string, string[]]> = [
  ["麻辣湯", ["麻辣湯", "麻辣燙", "麻辣烫", "マーラータン"]],
  ["ラーメン", ["ラーメン", "らーめん", "らぁ麺", "拉麺", "中華そば", "つけ麺", "つけめん", "担々麺", "担担麺", "坦々麺", "まぜそば", "油そば", "家系", "二郎系", "タンメン"]],
  ["焼鳥", ["焼鳥", "焼き鳥", "やきとり", "ヤキトリ", "炭火焼鳥", "炭火焼き鳥", "鳥料理", "とり料理"]],
  ["唐揚げ", ["唐揚げ", "唐揚", "からあげ", "から揚げ", "フライドチキン", "チキン南蛮"]],
  ["焼肉", ["焼肉", "焼き肉", "ヤキニク", "ホルモン", "ホルモン焼", "ジンギスカン", "牛タン"]],
  ["寿司", ["寿司", "鮨", "回転寿司", "にぎり寿司", "寿し", "すし処", "SUSHI"]],
  ["うどん", ["うどん", "讃岐うどん", "饂飩"]],
  ["そば", ["蕎麦", "十割そば", "手打ちそば", "そば処", "そば店", "立ち食いそば", "立ちそば"]],
  ["とんかつ", ["とんかつ", "トンカツ", "豚カツ", "かつ丼", "カツ丼", "ヒレかつ", "ロースかつ", "牛かつ", "牛カツ"]],
  ["天ぷら", ["天ぷら", "天麩羅", "天丼"]],
  ["うなぎ", ["うなぎ", "鰻", "ひつまぶし"]],
  ["海鮮", ["海鮮料理", "魚介料理", "魚料理", "海鮮丼", "浜焼", "牡蠣", "かき小屋", "魚丼", "海鮮居酒屋"]],
  ["しゃぶしゃぶ・鍋", ["しゃぶしゃぶ", "すき焼き", "すき焼", "もつ鍋", "火鍋", "鍋料理", "水炊き", "ちゃんこ"]],
  ["鉄板焼", ["鉄板焼", "お好み焼", "もんじゃ", "たこ焼", "たこやき"]],
  ["餃子", ["餃子専門", "焼き餃子専門", "餃子専門店", "餃子酒場", "餃子バル"]],
  ["中華", ["中華料理", "中国料理", "町中華", "ガチ中華", "四川料理", "台湾料理", "北京料理", "広東料理", "上海料理", "麻婆", "刀削麺", "小籠包", "点心", "飲茶", "餃子"]],
  ["韓国料理", ["韓国料理", "サムギョプサル", "チーズタッカルビ", "タッカルビ", "韓国チキン", "キンパ", "トッポッキ", "スンドゥブ", "ビビンバ", "ヤンニョム"]],
  ["タイ料理", ["タイ料理", "ガパオ", "トムヤム", "カオマンガイ", "パッタイ"]],
  ["ベトナム料理", ["ベトナム料理", "生春巻", "バインミー"]],
  ["インド料理", ["インド料理", "インドカレー", "ビリヤニ", "ネパール料理", "インドネパール", "インド・ネパール", "スリランカ料理", "パキスタン料理", "バングラデシュ料理", "タンドール", "ナンカレー"]],
  ["ケバブ", ["ケバブ", "ケバブサンド", "ドネルケバブ", "シシケバブ", "シシカバブ", "トルコ料理", "トルコ料理店"]],
  ["中東料理", ["中東料理", "アラブ料理", "ハラルフード", "ハラールフード"]],
  ["エスニック", ["エスニック", "アジアン料理", "アジア料理", "ミャンマー料理", "インドネシア料理", "マレーシア料理", "シンガポール料理", "フィリピン料理", "メキシコ料理", "タコス", "ブラジル料理", "ペルー料理", "スペイン料理", "パエリア", "ギリシャ料理", "モロッコ料理", "ジョージア料理", "シュクメルリ", "ロシア料理", "ウズベキスタン料理", "アフリカ料理"]],
  ["カレー", ["カレーライス", "カレー専門", "スープカレー", "ルーカレー", "カレー店", "スパイスカレー", "スパイスカリー", "カリー専門", "Curry", "CURRY", "カレー"]],
  ["ハンバーガー", ["ハンバーガー", "バーガー", "Burger", "BURGER"]],
  ["ハンバーグ・ステーキ", ["ハンバーグ", "ステーキ", "Steak", "STEAK", "ローストビーフ"]],
  ["洋食", ["洋食", "オムライス", "グラタン", "ドリア", "ビーフシチュー", "カツレツ"]],
  ["ピザ", ["ピザ", "ピッツァ", "Pizza", "PIZZA", "Pizzeria"]],
  ["パスタ", ["パスタ", "スパゲッティ", "スパゲティ", "ナポリタン", "ペペロンチーノ", "焼きスパ"]],
  ["イタリアン", ["イタリアン", "Italian", "Osteria", "オステリア", "トラットリア", "Ristorante", "リストランテ"]],
  ["フレンチ", ["フレンチ", "French", "ビストロ", "Bistro", "BISTRO", "Brasserie"]],
  ["和食", ["和食", "割烹", "懐石", "日本料理", "小料理", "おばんざい", "料亭", "郷土料理"]],
  ["定食", ["定食屋", "定食", "食堂", "おふくろの味"]],
  ["居酒屋", ["居酒屋", "酒場", "ダイニングバー", "肉バル", "ワインバル", "スペインバル", "イタリアンバル", "魚バル", "海鮮バル", "もつ焼き", "串揚げ", "串カツ", "立ち飲み", "立ち呑み", "立呑", "大衆酒場", "もつ煮", "炉端", "炉ばた", "串焼", "やきとん", "おでん", "せんべろ", "角打ち"]],
  ["バー", ["BAR", "ダイニングバー", "ワインバー", "ウイスキー", "カクテル", "オーセンティックバー", "ショットバー", "ビアバー", "ビアホール", "ダーツバー", "スポーツバー", "カフェバー", "カフェ&バー"]],
  ["ベーカリー", ["ベーカリー", "Boulangerie", "ブーランジェリー", "パン屋", "食パン専門", "高級食パン", "デニッシュ専門", "Bakery", "BAKERY", "bakery", "ベーグル", "カレーパン", "パン工房"]],
  ["カフェ", ["カフェ", "Cafe", "CAFE", "café", "Café", "喫茶店", "喫茶", "珈琲店", "珈琲", "コーヒースタンド", "コーヒー専門", "Coffee", "COFFEE", "ティーサロン", "ティールーム", "TEAROOM", "紅茶専門"]],
  ["ドリンク", ["ジュース", "スムージー", "ティースタンド", "ドリンクスタンド", "フルーツティー", "Juice", "JUICE"]],
  ["スイーツ", ["スイーツ", "ケーキ屋", "パティスリー", "ジェラート", "クレープ", "ドーナツ", "タピオカ", "かき氷", "マカロン", "アイスクリーム", "チュロス", "パフェ", "プリン", "シュークリーム", "バウムクーヘン", "チーズケーキ", "たい焼", "大判焼", "フルーツサンド", "ワッフル", "パンケーキ", "Sweets", "SWEETS", "DONUT", "Donut", "焼き菓子", "洋菓子", "フローズンヨーグルト", "ソフトクリーム"]],
  ["和菓子", ["和菓子", "大福", "団子", "だんご", "最中", "どら焼き", "おはぎ", "まんじゅう", "饅頭", "甘味処"]],
  ["サンドイッチ", ["サンドイッチ", "サンド専門", "ホットサンド"]],
  ["おにぎり・弁当", ["おにぎり", "おむすび", "焼むすび", "お弁当専門", "弁当専門", "弁当店", "惣菜", "お惣菜"]],
];

export const GENRES = GENRE_KEYWORDS.map(([g]) => g);

// 店名だけに使う追加の語（店名に入っていればほぼ確実にその業態）
const NAME_ONLY_GENRE: Array<[string, string[]]> = [
  ["そば", ["そば", "蕎麦"]],
  ["とんかつ", ["牛かつ", "牛カツ"]],
  ["バー", ["バー", "Bar"]],
];

export function extractGenre(text: string, title?: string, name?: string): string | null {
  if (name) {
    const n = normalizeText(name);
    for (const [genre, kws] of GENRE_KEYWORDS) if (kws.some((kw) => n.includes(kw))) return genre;
    for (const [genre, kws] of NAME_ONLY_GENRE) if (kws.some((kw) => n.includes(kw))) return genre;
  }
  if (title) {
    const t = normalizeText(title);
    // 見出しに複数の業態の語がある場合は「○○屋が」「○○店」のように業態として書かれている語を優先し、
    // 「名物は○○」「○○も楽しめる」のような料理の紹介は後回しにする
    let best: { genre: string; score: number; order: number } | null = null;
    GENRE_KEYWORDS.forEach(([genre, kws], order) => {
      for (const kw of kws) {
        const i = t.indexOf(kw);
        if (i === -1) continue;
        const after = t.slice(i + kw.length, i + kw.length + 4);
        const before = t.slice(Math.max(0, i - 4), i);
        let score = 1;
        if (/^(?:店|屋|専門|が|の店|「|『|さん)/.test(after)) score += 1;
        if (/(?:名物は|名物の|メニューは|人気の)$/.test(before) || /^(?:も楽しめ|も味わえ|も人気)/.test(after)) score -= 1;
        if (!best || score > best.score || (score === best.score && order < best.order)) best = { genre, score, order };
      }
    });
    if (best) return (best as { genre: string }).genre;
  }
  const body = normalizeText(text);
  const scores: Record<string, number> = {};
  for (const [genre, kws] of GENRE_KEYWORDS) {
    for (const kw of kws) {
      let count = 0;
      let idx = body.indexOf(kw);
      while (idx !== -1) {
        count++;
        idx = body.indexOf(kw, idx + kw.length);
      }
      if (count > 0) scores[genre] = (scores[genre] ?? 0) + count;
    }
  }
  const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return entries[0]?.[0] ?? null;
}

// ============================================================
// 店名
// ============================================================
const STORE_NAME_NEGATIVE = ["オープン", "OPEN", "開店", "新店", "紹介", "情報", "新店舗", "お店", "店舗"];

const TRAILING_PATTERNS = [
  /[、。]?\s*\d{1,4}年\d{1,2}月\d{1,2}日\s*(?:オープン|OPEN|開店|開業|グランドオープン)(?:予定)?[！!？?。]*\s*$/,
  /[、。]?\s*\d{1,2}月\d{1,2}日\s*(?:オープン|OPEN|開店|開業|グランドオープン)(?:予定)?[！!？?。]*\s*$/,
  /[、。]?\s*\d{1,2}月\s*(?:オープン|OPEN|開店|開業|グランドオープン)(?:予定)?[！!？?。]*\s*$/,
  /[、。]?\s*(?:に|で|へ|が|は|を)?\s*(?:新規)?(?:オープン|OPEN|開店|開業|グランドオープン)(?:予定|へ)?[！!？?。]*\s*$/,
];

// 鉤括弧の中身が商業施設・建物・駅など「場所」の名前らしいか
const PLACE_NAME_RE = /(?:駅|モール|タウン|プラザ|商店街|通り|ビル|ヒルズ|テラス|スクエア|センター|パーク|アウトレット|S\.?C\.?|百貨店|マルイ|ルミネ|アトレ|イオン|ららぽーと|ガーデン|横丁|市場|ホール|公園|跡地)$/;
// 店名として意味をなさない一般名詞（「パン屋さん」「新しいカフェ」など）
const GENERIC_NAME_RE = /^(?:新しい|新たな|人気の|話題の|気になる|あの|謎の|待望の)?.{0,6}(?:店|屋|屋さん|専門店|カフェ|レストラン|お店|ショップ|食堂)$/;

type QuoteCand = { text: string; score: number; index: number };

// 見出しの鉤括弧の中から店名らしいものを選ぶ。
// 後ろに「が/は/って」が続くもの（主語）を優先し、場所（「○○モール」に…）やメニュー名（「○○」を食べた）は避ける。
function pickQuotedName(t: string): string | null {
  const cands: QuoteCand[] = [];
  const re = /「([^」]{2,40})」|『([^』]{2,40})』|《([^》]{2,40})》|“([^”]{2,40})”/g;
  for (const m of t.matchAll(re)) {
    const inner = (m[1] ?? m[2] ?? m[3] ?? m[4]).trim();
    const start = m.index ?? 0;
    const end = start + m[0].length;
    const after = t.slice(end, end + 6);
    const before = t.slice(Math.max(0, start - 12), start);
    let score = 0;
    if (/^(?:が|は|って|という|、|！|!|オープン|OPEN|開店|開業|の(?:オープン|開店|魅力|新店|店舗|新業態|2号店|跡地に)?|に行って|へ行って|をオープン|と[「『])/.test(after)) score += 3;
    if (/^(?:で|の)/.test(after)) score += 1;
    if (/^(?:に(?!て|行)|跡|内|前|隣|近く|周辺|エリア|館|[0-9]+階|[0-9]+F|店内|にある|の[0-9]+階)/.test(after)) score -= 5;
    if (/^(?:を|食べ|実食|メニュー)/.test(after)) score -= 2;
    // 直前に「○○店の」「ラーメン店」「オープンの」など店を指す語があれば店名らしい
    if (/(?:店|専門店|カフェ|食堂|レストラン|酒場|ベーカリー|オープン|開店|開業|新店)の?$/.test(before)) score += 2;
    // 直前に「新作は」「名物の」などがあればメニュー名
    if (/(?:新作|新メニュー|限定メニュー|名物|看板メニュー|人気メニュー|商品)(?:は|の|として)?$/.test(before)) score -= 3;
    if (PLACE_NAME_RE.test(inner)) score -= 4;
    if (STORE_NAME_NEGATIVE.includes(inner)) score -= 10;
    // “”はキャッチコピーに使われやすい
    if (m[4] !== undefined) score -= 1;
    cands.push({ text: inner, score, index: start });
  }
  if (cands.length === 0) return null;
  cands.sort((a, b) => b.score - a.score || a.index - b.index);
  const best = cands[0];
  if (best.score <= -5 && cands.length === 1) return null;
  return best.text;
}

// 店名として使える形か（文章の切れ端・一般名詞・「新しく○○」等ではない）
export function looksLikeStoreName(n: string): boolean {
  if (n.length < 2 || n.length > 30) return false;
  if (GENERIC_NAME_RE.test(n) || STORE_NAME_NEGATIVE.includes(n)) return false;
  if (/(?:お店|店舗|新店|専門店)$/.test(n) && !/[A-Za-zァ-ヶ]{2,}/.test(n.replace(/(?:お店|店舗|新店|専門店)$/, ""))) return false;
  if (/^(?:新しく|新たに|新しい|あの|話題の|待望の|人気の)/.test(n)) return false;
  if (/[。！!？?]|は[\s、]|[をにで]\s/.test(n)) return false;
  const hira = (n.match(/[ぁ-ん]/g)?.length ?? 0) / n.length;
  return hira <= 0.5;
}

// 見出しの末尾の【店名】（「…がオープン！【七宝麻辣湯】」など）
function pickTrailingBracketName(title: string): string | null {
  const m = normalizeText(title).match(/【([^】]{2,30})】\s*$/);
  if (!m) return null;
  const inner = m[1].trim();
  // 地域名・分類ラベル（【千種区開店】【京都市伏見区】【新店情報】等）は店名ではない
  if (/(?:開店|閉店|オープン|新店|情報|速報|レポ|特集|まとめ|PR)/.test(inner)) return null;
  if (/^[^\s]{1,8}[都道府県市区町村]$/.test(inner) || /[市区町村](?:周辺|エリア)?$/.test(inner)) return null;
  return inner;
}

// 本文の「店名：○○」「【店名】○○」「店名は「○○」」などの表記から店名を拾う
function pickLabeledName(body: string): string | null {
  const t = normalizeText(body).slice(0, 6000);
  const m =
    t.match(/(?:店名|店舗名|お店の名前)\s*(?:[:：]|は|が|＝)?\s*(?:「([^」]{2,40})」|『([^』]{2,40})』|《([^》]{2,40})》)/) ??
    t.match(/(?:【店名】|【店舗名】|[■●◆]\s*店名|店名\s*[:：]|店舗名\s*[:：])\s*()()()([^\s、。|｜/「」『』]{2,30}(?:\s[^\s、。|｜/「」『』]{1,15}){0,2})/);
  if (!m) return null;
  let name = (m[1] || m[2] || m[3] || m[4] || "")
    .replace(/(?:住所|所在地|営業時間|定休日|電話|TEL|アクセス|最寄り?|URL|公式).*$/, "")
    .replace(/[」』】）)]+$/, "")
    .replace(/^[「『【（(]+/, "")
    .trim();
  if (name.length < 2 || STORE_NAME_NEGATIVE.includes(name)) return null;
  // 文章の一部を拾っていないか（述語・助詞で終わる）
  if (/(?:です|ます|でしょう|ような|ように|された|される|ない|[をにはがで])$/.test(name)) return null;
  return name;
}

export function extractStoreName(title: string, body?: string): string | null {
  let cleaned = normalizeText(title)
    .replace(/【[^】]*】\s*/g, "")
    .replace(/^\s*\d+[\.、]\s*/, "")
    .trim();

  // 見出し先頭の「YYYY年M月D日オープン」「M月D日オープン」等（日付＋開店表現）を除去する。
  // 京都速報など「＜日付＞オープン ＜店名＞」形式の見出しで店名に日付が混じるのを防ぐ。
  cleaned = cleaned
    .replace(/^(?:\d{4}年)?\d{1,2}月\d{1,2}日\s*(?:に|の)?\s*(?:オープン|OPEN|開店|開業|グランドオープン|新規オープン)(?:予定)?[、,\s]*/i, "")
    .trim();

  // 「店名 – カテゴリ名」「店名 | サイト名」のような区切りの後ろはサイト側の付け足し
  const seg = cleaned
    .split(/\s+[–—|｜]\s+|\s+-\s+|｜/)
    .map((x) => x.replace(/\s*(?:オープン日|開店日|オープン情報|新店情報)$/, "").trim())
    .filter(Boolean);
  if (seg.length > 1) {
    const withQuote = seg.find((x) => /[「『《“]/.test(x));
    if (withQuote) cleaned = withQuote;
    else {
      // 開店の語を含む部分（説明文）や市区町村名だけの部分、ひらがなの多い文章は店名ではない
      const isPlace = (x: string) => /^[^\s]{1,6}[市区町村]$/.test(x);
      const hira = (x: string) => (x.match(/[ぁ-ん]/g)?.length ?? 0) / x.length;
      const nameLike = seg.filter((x) => x.length >= 2 && !/(?:オープン|open|開業|開店|新店|閉店)/i.test(x) && !isPlace(x) && hira(x) <= 0.5);
      cleaned = nameLike[0] ?? seg[0];
    }
  }

  const quoted = pickQuotedName(cleaned);
  if (quoted) return quoted;
  const bracket = pickTrailingBracketName(title);
  if (bracket) return bracket;

  // レビュー系ブログの見出し形式「○○にオープン（、/空白）＜店名＞で頂く△△」から店名を抜く。
  // 例: 「千葉駅から徒歩10分に7/3オープン、KARUKARIで頂くポークビンダルーカレー」→ KARUKARI
  const review = cleaned.match(/(?:オープン|OPEN|開店|開業)[、,\s]+([^、。]{2,30}?)(?:で(?:頂く|いただく|味わう|食べ|楽し|堪能|楽しむ)|にて)/);
  if (review) {
    const inner = review[1].trim();
    if (inner.length >= 2 && !STORE_NAME_NEGATIVE.includes(inner)) return inner;
  }

  // 「元住吉：ブーランジュリードゥーブ 元住吉店 10月16日オープン」のように、店名の直後に日付とオープンが続く形
  const dated = cleaned.match(/(?:^|[：:！!】♪]\s*)([^\s：:！!、。「」]{2,25}(?:\s[^\s：:！!、。「」]{1,12}){0,2})\s+(?:[0-9]{1,2}月[0-9]{1,2}日|[0-9]{1,2}\/[0-9]{1,2})\S{0,4}?\s*(?:に)?\s*(?:グランド|プレ)?(?:オープン|OPEN|開店)/);
  if (dated && !GENERIC_NAME_RE.test(dated[1])) return dated[1];
  // 「休業中のcovo(コーヴォ)のリニューアルオープンが10月1日に」
  const noOpen = cleaned.match(/([^\s、。のにでへ「」]{2,25})の(?:リニューアル|グランド|新規)?(?:オープン|開店)(?:日)?(?:が|は)/);
  if (noOpen && !GENERIC_NAME_RE.test(noOpen[1]) && !STORE_NAME_NEGATIVE.includes(noOpen[1])) return noOpen[1];
  // 「昨年オープン、すし暖笑 絶品鮮魚に…」
  const afterOpen = cleaned.match(/(?:オープン|OPEN|開店|開業)[、,]\s*([^\s、。]{2,20})\s/);
  if (afterOpen && !GENERIC_NAME_RE.test(afterOpen[1]) && !/^(?:新|記念|予定|限定)/.test(afterOpen[1])) return afterOpen[1];

  // 本文に「店名：○○」があればそれを使う
  if (body) {
    const labeled = pickLabeledName(body);
    if (labeled) return labeled;
  }

  // 「○○に△△がオープンしたよ」形式から △△ を抜く（一般名詞しか取れない場合は使わない）
  const ga = cleaned.match(/(?:^|[にでへ、！!♪】）)][、,\s]*)([^\s、。「」にでへ！!♪][^、。「」にでへ！!♪]{1,24}?)\s*が[、,\s]*(?:[^\s、。]{1,10}?に)?(?:[0-9]{1,2}月[0-9]{1,2}日\S{0,5}?[、,\s]*)?(?:新規|新しく|グランド|ついに|いよいよ)?\s*(?:オープン|OPEN|開店|開業|移転)/);
  if (ga && !GENERIC_NAME_RE.test(ga[1]) && !STORE_NAME_NEGATIVE.includes(ga[1])) return ga[1];
  const comma = cleaned.match(/^([^、。！!？?]{2,30})[、,]\s*(?:オープン|OPEN|開店|開業|グランドオープン|リニューアル)/);
  if (comma && !GENERIC_NAME_RE.test(comma[1])) return comma[1].trim();

  let prev = "";
  while (cleaned !== prev) {
    prev = cleaned;
    for (const re of TRAILING_PATTERNS) cleaned = cleaned.replace(re, "").trim();
    cleaned = cleaned
      .replace(/[、。]?\s*(?:が|は)?\s*(?:新規)?(?:オープン|OPEN|開店|開業)(?:し(?:ました|てる|ている|ていました|た)|します|する|しそう|予定|決定)(?:よ|みたい|です|ね|♪|！|!|。)*\s*$/, "")
      .trim();
  }

  cleaned = cleaned.replace(/[、。]?\s*(?:注目|話題|大人気)\s*$/, "").trim();

  for (const neg of STORE_NAME_NEGATIVE) {
    if (cleaned === neg) return null;
  }
  return cleaned || null;
}

// ============================================================
// 最寄駅
// ============================================================
const STATION_STOPWORDS = [
  "最寄り駅", "最寄駅", "各駅", "主要駅", "同駅", "当駅", "隣駅", "終着駅", "始発駅", "乗換駅", "乗り換え駅",
  "ターミナル駅", "地下鉄駅", "新駅", "この駅", "その駅", "両駅", "起点駅", "途中駅", "停車駅", "下車駅",
  "通過駅", "最寄りの駅", "道の駅", "病院駅", "郵便駅", "の駅", "前駅", "次駅", "駅",
];
// 「JR」「地下鉄」「○○線」のような路線の説明は外す（「東武練馬駅」「京成高砂駅」のような駅名そのものは残す）
const RAILWAY_PREFIX_RE = /^(?:JR|ＪＲ|地下鉄|東京メトロ|大阪メトロ|メトロ|都営|市営|[^\s駅]{1,8}線)/;

export function extractNearestStation(text: string): string | null {
  const re = /(?<![一-龥ぁ-んァ-ヶー々])([一-龥ぁ-んァ-ヶー々]{2,12}駅)/g;
  for (const m of normalizeText(text).matchAll(re)) {
    let station = m[1]
      // 「左手には新板橋駅」「合わせて潮見駅」のような前置きを切る（最後に出てくる区切りの後ろだけ残す）
      .replace(/^.*(?:には|では|から|まで|より|合わせて|あわせて|そして|また|なお|さらに|ちなみに|左手|右手|目の前|すぐ|近くの|最寄りの|最寄り|最寄|場所は|お店は|店舗は|徒歩で|なら|って|という)/, "")
      // 「また新宿駅」「の新宿駅」のような助詞の混入を外す（「ときわ台駅」等は残す）
      .replace(/^[はがのにをでとへもや](?=[一-龥ァ-ヶ])/, "");
    for (let k = 0; k < 3; k++) station = station.replace(RAILWAY_PREFIX_RE, "");
    if (station.length < 3 || station.length > 9) continue;
    if (/(?:ほど|ちょっと|から|まで|徒歩|約|分|こと|ため|ところ|など|離れ|少し|すぐ|向かい|周辺|付近|界隈)/.test(station)) continue;
    if (STATION_STOPWORDS.some((w) => station === w || (w.length >= 3 && station.endsWith(w)))) continue;
    return station;
  }
  return null;
}

// ============================================================
// 開店記事の判定
// ============================================================
// 見出しにあれば開店記事とみなす語
const STRONG_OPEN_RE = /(オープン|OPEN|Open|開店|開業|新規開店|新店|新装開店|移転|リニューアル)/;
// 単独では弱いが、店の名前や飲食の語と一緒なら開店記事とみなす語
const WEAK_OPEN_RE = /(誕生|初出店|新規出店|に出店|が出店|上陸|できるみたい|ができる|ができた|ができてる|できてた|できてる|つくってる|つくってた|作ってる|新登場|開業へ)/;
const STORE_NOUN_RE = /(店|専門店|カフェ|食堂|レストラン|酒場|ベーカリー|「[^」]+」|『[^』]+』)/;

// 経済新聞ネットワーク等は見出しに「オープン/開店」を入れず、
// 「○○に「店名」」「○○に△△店」形式で新規開店を告知する。
// その場合は本文の開店表現で裏取りする（見出し形式＋本文開店語の二重条件で誤検出を抑制）。
const NEWSHOP_TITLE_RE = /[にへ]「[^」]{2,}」|[にへ][^\s、。]{0,14}(?:専門店|食堂|レストラン|ダイニング|カフェ|酒場|バル|ビストロ|店)(?:が|、|を|\s|$)/;
const BODY_OPENING_RE = /(オープン|開店|開業|グランドオープン|新規開店|新装開店)/;

// 見出しにあれば常に除外する語（開店記事ではない／店舗の新規開店ではない）
const TITLE_HARD_REJECTS = [
  "補助金", "助成金", "給付金", "支援金", "奨励金", "報奨金",
  "採用情報", "説明会", "セミナー", "講座", "講習",
  "議会", "選挙", "総選挙", "議員", "行政", "条例", "法改正",
  "通行止め", "通行止", "不審者", "防犯", "犯罪", "詐欺", "事件", "事故", "火災", "救急",
  "マンション", "物件", "分譲", "賃貸", "住宅情報", "家賃", "売地", "売家", "中古住宅", "建売",
  "健康診断", "予防接種", "ワクチン", "がん検診",
  "閉鎖", "閉校", "中止",
  "ランキング", "ランクイン", "第1位", "第一位", "TOP10", "まとめ", "特集", "クイズ",
];
// 期間限定の出店・催事・移動販売（固定の店舗ではない）と、開店何周年の記事
const POPUP_RE = /(期間限定(?:で|の)?\s*(?:オープン|OPEN|出店|営業|ショップ|ストア|店舗|販売)|ポップアップ|POP ?UP|催事|キッチンカー|移動販売|(?:オープン|開店|開業)[0-9一二三四五六七八九十]+周年)/i;
// 見出しにはっきり開店の語がない場合だけ除外する語
// （「オープン記念キャンペーン」「オープンに向けて工事中」等の開店記事を落とさないため）
const TITLE_SOFT_REJECTS = [
  "キャンペーン", "抽選", "プレゼント", "当選", "応募", "募集", "公募", "求人",
  "ワークショップ", "イベント", "まつり", "祭り", "フェス", "マルシェ",
  "終了", "締切", "締め切り", "延期", "休業", "臨時休業", "営業時間変更",
  "リフォーム", "工事", "規制", "注意", "警告", "被害", "新築", "インタビュー", "ベスト", "周年",
  "販売開始", "発売", "新メニュー", "新商品", "限定メニュー", "コラボ", "販売エリア", "数量限定",
];
const OPEN_VERB_G = /オープン|OPEN|開店|開業|新規開店|New Open|NEW OPEN/gi;
const CLOSE_WORD_G = /閉店|閉業|ラストデー|ラストオーダー終了|営業終了/g;
// 「オープンから半年」「2023年11月開店の」など、過去の開店に触れているだけの言い回し
const PAST_OPEN_RE = /(?:オープン|開店|開業)(?:して)?(?:から|以来|当初|当時)|[0-9]{4}年[0-9]{1,2}月(?:に)?(?:オープン|開店|開業)(?:の|した)|再(?:OPEN|オープン)に向けて|(?:閉店|休業)(?:から|後|して|を経て|の後)/gi;
// 「○○跡地に」「○○の隣に」「○○が入るビルに」など、目印として他の店が出てくる部分
const LANDMARK_RE = /(?:「[^」]*」|『[^』]*』)?[^\s、。！!？?「」『』【】]{0,25}?(?:の跡地|跡地|の跡|の隣|隣|の横|の近く|の向かい|が入る)(?:に|で|の|は|、|$)/g;

// 飲食以外の業種（見出しにあれば、飲食の語がない限り除外）
const NON_FOOD_BUSINESS = [
  "美容室", "美容院", "美容", "ヘアサロン", "ヘアケア", "ヘッドスパ", "バーバー", "BARBER", "理容", "床屋",
  "ネイル", "ネイルサロン", "エステ", "エステサロン", "マッサージ", "脱毛", "まつげ", "眉毛", "コスメ", "化粧品",
  "リラクゼーション", "整体", "整骨", "接骨", "鍼灸", "カイロプラクティック",
  "ホワイトニング", "歯科", "歯医者", "クリニック", "診療所", "医院", "耳鼻科", "眼科", "皮膚科", "動物病院",
  "内科", "外科", "小児科", "医療", "メディカル",
  "薬局", "調剤", "ドラッグストア", "ドラッグ",
  "介護", "デイサービス", "訪問看護", "保育園", "幼稚園", "学童",
  "メガネ", "眼鏡", "コンタクト",
  "不動産", "住まい", "リフォーム", "住宅展示", "モデルハウス", "工務店",
  "セレクトショップ", "アパレル", "古着", "ブティック", "衣料", "衣料品",
  "子ども服", "子供服", "こども服", "キッズウェア", "キッズ服",
  "ベビー服", "ベビーウェア", "マタニティウェア",
  "紳士服", "婦人服", "メンズ服", "レディース服", "オーダースーツ",
  "ファッション", "ファッションブランド", "フラッグショップ", "旗艦店",
  "洋服店", "服飾", "アクセサリー", "ジュエリー", "時計店", "腕時計",
  "靴店", "シューズ", "スニーカー", "バッグ", "鞄", "靴下",
  "書店", "本屋", "古本", "文具", "文房具", "手芸", "画材",
  "100円ショップ", "100均", "300円ショップ", "ダイソー", "セリア", "キャンドゥ",
  "雑貨店", "生活雑貨", "雑貨", "インテリアショップ", "インテリア", "家具店", "家具", "家電", "ホームセンター",
  "おもちゃ", "玩具", "カプセルトイ", "ガチャガチャ", "トレカ", "カードショップ",
  "フィットネス", "ジム", "ヨガスタジオ", "ヨガ", "ピラティス", "ゴルフ", "卓球", "ボルダリング", "ダンススクール",
  "学習塾", "塾", "英会話", "スクール", "教室", "予備校", "プログラミング",
  "買取", "質屋", "リサイクルショップ", "リユース",
  "パチンコ", "スロット", "ゲームセンター", "カラオケ", "ネットカフェ", "漫画喫茶", "まんが喫茶",
  "コインランドリー", "ランドリー", "クリーニング店", "クリーニング",
  "ペットショップ", "トリミング", "ペットサロン",
  "花屋", "フラワーショップ",
  "葬儀", "葬祭",
  "自動車販売", "カーディーラー", "中古車", "レンタカー", "カー用品", "洗車", "自転車", "バイク", "ガソリンスタンド",
  "家電量販", "携帯ショップ", "スマホ", "修理",
  "トランクルーム", "コワーキング", "シェアオフィス", "レンタルスペース", "貸し会議室",
  "ホテル", "旅館", "民泊", "ゲストハウス", "宿泊", "ヴィラ", "グランピング", "キャンプ場",
  "サウナ", "銭湯", "温泉", "スパ施設",
  "銀行", "ATM", "保険", "郵便局",
  "スーパー", "業務スーパー", "ディスカウントストア", "ドン・キホーテ", "食品館", "鮮魚店", "精肉店", "八百屋", "青果",
  "西友", "ヤオコー", "マルエツ", "ロピア", "まいばすけっと", "ビッグ・エー", "マミープラス", "ヨークマート",
  "成城石井", "カルディ", "オーケーストア", "ベルク", "トライアル", "コープ", "生協",
  "写真館", "フォトスタジオ", "商業拠点", "体験施設", "クッキング",
  "東武ストア", "東急ストア", "京王ストア", "明治屋", "紀ノ国屋", "いなげや", "イトーヨーカドー", "ヨーカドー", "ダイエー",
  "マックスバリュ", "イオンスタイル", "ピーコック", "オオゼキ", "相鉄ローゼン", "リカーショップ", "酒屋",
];
// 場所の名前として出てきやすい語（見出しにあっても即除外はせず、本文で判断する）
const NON_FOOD_PLACE = [
  "公園", "商業施設", "ショッピングモール", "ショッピングセンター", "モール", "駅ビル",
  "図書館", "ライブラリ", "ミュージアム", "美術館", "博物館", "病院", "ホール", "新ビル", "ビル",
];

// 飲食店であることがはっきり分かる語
const FOOD_STRONG = [
  "飲食店", "飲食", "食堂", "レストラン", "料理", "和食", "洋食", "中華", "和菓子", "洋菓子", "食事処", "ごはん", "ご飯", "めし",
  "ラーメン", "らーめん", "らぁ麺", "拉麺", "中華そば", "つけ麺", "まぜそば", "油そば", "担々麺", "タンメン", "とんこつ", "豚骨",
  "蕎麦", "そば処", "そば店", "立ち食いそば", "うどん", "麺",
  "カフェ", "Cafe", "CAFE", "café", "Café", "cafe", "喫茶", "珈琲", "ティーサロン", "TEAROOM", "ティールーム",
  "パン屋", "パン工房", "パン店", "パン専門", "食パン", "ベーカリー", "ブーランジェリー", "Bakery", "BAKERY", "bakery", "ベーグル", "ブレッド", "サワードゥ",
  "居酒屋", "酒場", "ビストロ", "Bistro", "BISTRO", "Dining", "DINING", "立ち飲み", "立ち呑み",
  "ワインバー", "ダイニングバー", "ショットバー", "ビアバー", "スポーツバー", "ダーツバー", "カフェバー", "カフェ&バー", "バー「", "バー『",
  "焼肉", "焼鳥", "焼き鳥", "やきとり", "串焼", "串カツ", "串揚げ", "鉄板焼", "やきとん", "もつ焼", "もつ鍋",
  "寿司", "鮨", "回転すし", "すし処", "鳥刺", "とりさし", "刺身",
  "イタリアン", "フレンチ", "韓国料理", "タイ料理", "ベトナム料理", "インド料理", "ネパール", "エスニック", "中東料理",
  "カレー", "Curry", "CURRY", "麻辣湯", "麻辣燙", "マーラータン", "ビリヤニ", "ケバブ", "タコス", "ブリトー", "バインミー", "ガパオ",
  "スイーツ", "Sweets", "SWEETS", "ケーキ", "パティスリー", "ジェラート", "クレープ", "かき氷", "タピオカ",
  "ドーナツ", "DONUT", "Donut", "チュロス", "パフェ", "プリン", "ジュース", "スムージー", "たい焼", "大判焼", "どら焼",
  "フードコート", "厨房", "惣菜", "おにぎり", "おむすび", "焼むすび",
  "餃子", "たこ焼", "お好み焼", "もんじゃ", "唐揚", "からあげ", "から揚げ", "コロッケ", "ホットドッグ", "焼きそば",
  "肉料理", "肉バル", "ステーキ", "ハンバーグ", "海鮮", "魚介", "魚料理", "浜焼",
  "サンドイッチ", "バーガー", "ハンバーガー", "ピザ", "ピッツァ", "パスタ", "丼", "定食", "しゃぶしゃぶ", "すき焼",
  "天ぷら", "天丼", "とんかつ", "かつ丼", "うなぎ", "鰻", "割烹", "懐石", "日本料理", "おばんざい", "小料理",
  "日本酒", "クラフトビール", "ハイボール",
  "焼き肉", "オムライス", "グラタン", "ナポリタン", "ワッフル", "トースト", "パンケーキ", "ガレット", "シュークリーム", "マカロン",
  "バウムクーヘン", "ソフトクリーム", "茶房", "甘味", "団子", "大福", "おはぎ", "まんじゅう", "にぎり", "握り", "おでん", "炉端", "炉ばた",
  "せんべろ", "角打ち", "つけめん", "らあめん", "点心", "小籠包", "飲茶", "火鍋", "薬膳", "お粥", "サラダ専門", "サラダボウル", "アサイー",
];
// 飲食の語ではあるが、他業種の見出しにも出てくる語（他業種の語と一緒なら飲食とみなさない）
const FOOD_WEAK = [
  "食事", "グルメ", "モーニング", "ディナー", "キッチン", "Kitchen", "KITCHEN", "ダイニング",
  "コーヒー", "Coffee", "COFFEE", "ワイン", "テイクアウト", "ランチ", "お酒", "お弁当", "弁当", "アイス", "鍋", "鉄板", "ホルモン", "もつ",
];
// 飲食の語を含むが飲食店ではない言葉
const FOOD_FALSE_FRIENDS = [
  "料理教室", "パン教室", "お菓子教室", "ケーキ教室", "そば打ち体験", "料理研究家", "コーヒー豆", "フードバンク", "フードドライブ",
  "ネットカフェ", "インターネットカフェ", "漫画喫茶", "まんが喫茶", "コスメキッチン", "ジェラートピケ", "ジェラート ピケ",
  "gelato pique", "キッチンカー", "キッチン用品", "システムキッチン", "ダイニングテーブル", "フランチャイズ",
];
// 「バル」「BAR」は他の単語の一部（グローバル、BARBER など）を除いて数える
const BAR_WORD_RE = /(?<![A-Za-z])(?:BAR|Bar)(?![A-Za-z])|(?<![ーァ-ヶ])バル(?![ーコンカクチラブトドゥセ])/;

function removeAll(s: string, words: string[]): string {
  let out = s;
  for (const w of words) out = out.split(w).join(" ");
  return out;
}

function containsAny(s: string, words: string[]): boolean {
  return words.some((w) => s.includes(w));
}

function countDistinct(s: string, words: string[]): number {
  let n = 0;
  for (const w of words) if (s.includes(w)) n++;
  return n;
}

// 業種の判定に使う前に、目印として出てくる他店・過去の開店の話を取り除く
function focusText(s: string): string {
  return removeAll(s, FOOD_FALSE_FRIENDS).replace(PAST_OPEN_RE, " ").replace(LANDMARK_RE, " ");
}

function hasStrongFood(s: string): boolean {
  return containsAny(s, FOOD_STRONG) || BAR_WORD_RE.test(s);
}

// 店名そのものが飲食以外の業種を表しているか（「サンドラッグ ○○店」「カラオケ○○」等）
const MALL_NAME_RE = /^(?:イオンモール|イオンタウン|イオン|ららぽーと|ららテラス|アリオ|ルミネ|マルイ|アトレ|ミーナ|エキュート|グランエミオ|ビナウォーク|ダイナシティ|テラスモール|ekubo|エキア|エミオ|ペリエ|シャポー)/;

export function nameLooksNonFood(name: string): boolean {
  const n = removeAll(normalizeText(name), FOOD_FALSE_FRIENDS);
  if (hasStrongFood(n)) return false;
  return containsAny(n, NON_FOOD_BUSINESS) || MALL_NAME_RE.test(n);
}

export type OpeningVerdict = { ok: boolean; reason: string };

export function classifyArticle(title: string, content: string): OpeningVerdict {
  const t = normalizeText(title);
  const c = normalizeText(content);

  const strongOpen = STRONG_OPEN_RE.test(t);
  const focused = focusText(t);
  const titleFood = hasStrongFood(focused) || containsAny(focused, FOOD_WEAK);
  const weakOpen = WEAK_OPEN_RE.test(t) && (STORE_NOUN_RE.test(t) || titleFood);
  const newsStyle = NEWSHOP_TITLE_RE.test(t) && BODY_OPENING_RE.test(c);
  if (!strongOpen && !weakOpen && !newsStyle) return { ok: false, reason: "見出しに開店の語なし" };

  for (const kw of TITLE_HARD_REJECTS) {
    if (t.includes(kw)) return { ok: false, reason: `見出し除外語:${kw}` };
  }
  const popup = t.match(POPUP_RE);
  if (popup) return { ok: false, reason: `期間限定・催事:${popup[0]}` };

  // 閉店語を含む見出しは原則除外。ただし「○○が閉店、跡地に△△がオープン」「移転のため閉店、△△にオープン」
  // のように閉店の後ろに開店の動詞がある場合は、新しい店（新住所）のリードとして拾う。
  // （「移転」を含むだけでは許可しない。「○○が閉店、店主の故郷へ移転」のような純粋な閉店記事を除く）
  const tNoPast = t.replace(PAST_OPEN_RE, " ");
  const opens = [...tNoPast.matchAll(OPEN_VERB_G)].map((m) => m.index ?? 0);
  const closes = [...tNoPast.matchAll(CLOSE_WORD_G)].map((m) => m.index ?? 0);
  const lastOpen = opens.length ? Math.max(...opens) : -1;
  const lastClose = closes.length ? Math.max(...closes) : -1;
  if (lastClose >= 0 && lastClose > lastOpen) return { ok: false, reason: "閉店記事" };

  if (lastOpen < 0) {
    for (const kw of TITLE_SOFT_REJECTS) {
      if (t.includes(kw)) return { ok: false, reason: `見出し除外語:${kw}` };
    }
  }

  // 見出しに飲食の語があれば、本文に他業種の語（隣のジム、跡地の薬局など）が出ても飲食とみなす
  if (hasStrongFood(focused)) return { ok: true, reason: "見出しに飲食の語" };
  if (containsAny(focused, NON_FOOD_BUSINESS)) return { ok: false, reason: "見出しが飲食以外" };
  if (containsAny(focused, FOOD_WEAK)) return { ok: true, reason: "見出しに飲食の語(弱)" };

  // 見出しだけでは業種が分からない場合は、本文の冒頭（店の紹介が書かれる部分）で判断する
  const lead = focusText(c.slice(0, 700));
  const food = countDistinct(lead, FOOD_STRONG) + countDistinct(lead, FOOD_WEAK) + (BAR_WORD_RE.test(lead) ? 1 : 0);
  const nonFood = countDistinct(lead, NON_FOOD_BUSINESS);
  const need = containsAny(focused, NON_FOOD_PLACE) ? 2 : 1;
  if (food >= need && food > nonFood) return { ok: true, reason: "本文冒頭に飲食の語" };
  return { ok: false, reason: food === 0 ? "飲食の語なし" : "本文冒頭が飲食以外" };
}

export function isFoodOpening(title: string, content: string): boolean {
  return classifyArticle(title, content).ok;
}

// 大手チェーン・全国展開ブランド（除外キーワード）— 取込段階で自動スキップ
const CHAIN_KEYWORDS = [
  // コーヒーチェーン
  "スターバックス", "Starbucks", "STARBUCKS", "スタバ",
  "ドトール", "ベローチェ", "エクセルシオール", "タリーズ", "Tully",
  "サンマルクカフェ", "コメダ珈琲", "プロント",
  "ブルーボトル", "星乃珈琲",
  // ファストフード
  "マクドナルド", "McDonald", "マック",
  "ミスタードーナツ", "ミスド",
  "ケンタッキー", "KFC",
  "モスバーガー", "バーガーキング", "フレッシュネスバーガー", "ロッテリア",
  "サブウェイ",
  // 牛丼・和食チェーン
  "吉野家", "松屋", "すき家", "なか卯",
  "大戸屋", "やよい軒", "ねぎし",
  // ファミレス
  "ガスト", "ジョナサン", "サイゼリヤ", "デニーズ", "ロイヤルホスト",
  "ココス", "ビッグボーイ", "バーミヤン", "夢庵",
  "丸亀製麺", "はなまるうどん",
  // ラーメンチェーン
  "一蘭", "一風堂", "天下一品", "幸楽苑", "日高屋", "リンガーハット",
  "ラーメン横綱", "スガキヤ",
  // 寿司チェーン
  "スシロー", "くら寿司", "はま寿司", "かっぱ寿司", "銚子丸",
  // 焼肉チェーン
  "牛角", "焼肉キング", "安楽亭", "焼肉ライク",
  // ピザ・パスタチェーン
  "ドミノ・ピザ", "ドミノピザ", "ピザハット", "ピザーラ",
  "カプリチョーザ", "五右衛門", "鎌倉パスタ",
  // カレーチェーン
  "CoCo壱番屋", "ココイチ", "日乃屋カレー",
  // 居酒屋チェーン
  "鳥貴族", "串カツ田中", "ワタミ", "魚民", "白木屋", "和民",
  "磯丸水産", "はなの舞",
  // ベーカリーチェーン
  "サンジェルマン", "ヴィ・ド・フランス", "リトルマーメイド",
  // スイーツ・アイスチェーン
  "31アイスクリーム", "サーティワン", "Baskin Robbins", "ハーゲンダッツ",
  "コールド・ストーン", "ブロンコビリー",
  "シャトレーゼ", "不二家",
  // コンビニ
  "セブン-イレブン", "セブンイレブン", "ローソン", "ファミリーマート", "ミニストップ", "デイリーヤマザキ",
  // 大手ブランド・アパレル（食と別だが除外強化）
  "無印良品", "ユニクロ", "GU", "しまむら",
];

// チェーン判定は「店名」のみで行う。
// 地域ブログは道案内で近隣チェーン店（丸亀製麺/鳥貴族/セブンイレブン等）を
// 目印に使うため、本文をスキャンすると個人店が誤ってチェーン扱いされ取りこぼす。
// 短い名前・英字の名前が別の単語の一部に一致しないようにする（「ガストロノミア」「GUEST」等）
const CHAIN_GUARDS: Record<string, string> = {
  "ガスト": "(?!ロ)",
  "マック": "(?!ス)",
  "松屋": "(?!銀座|百貨店)",
};
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const CHAIN_RES = CHAIN_KEYWORDS.map((kw) => {
  const k = kw.replace(/[ーｰ\-‐‑–—―－]/g, "");
  const body = escapeRe(k) + (CHAIN_GUARDS[kw] ?? "");
  return /^[A-Za-z0-9 .'&]+$/.test(k) ? new RegExp(`(?<![A-Za-z])${body}(?![A-Za-z])`) : new RegExp(body);
});

export function isChainStore(name: string): boolean {
  if (!name) return false;
  // 店名は正規化で長音符「ー」が「-」等に変換されるため、
  // 長音符・各種ダッシュを除去してからチェーン名と突合する。
  const n = name.replace(/[ーｰ\-‐‑–—―－]/g, "");
  return CHAIN_RES.some((re) => re.test(n));
}

// ============================================================
// 店名どうしの比較（重複判定用）
// ============================================================
// 表記ゆれ（空白・記号・店舗名の「○○店」・カナの長音など）を除いた比較キー
export function nameKey(name: string): string {
  return normalizeStoreName(name)
    .replace(/[「」『』《》“”"'’・･\-ー―‐－~〜!！?？.,、。&＆♪☆★◆■●▲]/g, "")
    .replace(/(?:本店|[0-9一二三四五六七八九十]+号店)$/, "");
}

// 2つの店名が同じ店を指していると言えるくらい近いか
export function namesCompatible(a: string, b: string): boolean {
  const x = nameKey(a);
  const y = nameKey(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [s, l] = x.length <= y.length ? [x, y] : [y, x];
  // 短い方が長い方に含まれる（「焼肉○○」と「焼肉○○ 新宿店」など）。短すぎる一致は除く
  if (s.length >= 3 && l.includes(s)) return true;
  // 文字の重なり（2文字ずつの組の一致率）で判定
  const grams = (str: string) => {
    const out = new Set<string>();
    for (let i = 0; i < str.length - 1; i++) out.add(str.slice(i, i + 2));
    return out;
  };
  const gx = grams(x);
  const gy = grams(y);
  if (gx.size === 0 || gy.size === 0) return false;
  let inter = 0;
  for (const g of gx) if (gy.has(g)) inter++;
  return (2 * inter) / (gx.size + gy.size) >= 0.6;
}
