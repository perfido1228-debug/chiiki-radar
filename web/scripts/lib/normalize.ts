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
  "－": "-", "ー": "-", "―": "-", "　": " ",
};

export function normalizeText(s: string | null | undefined): string {
  if (!s) return "";
  let out = "";
  for (const ch of s) out += ZEN_HAN[ch] ?? ch;
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

export function normalizeTel(tel: string | null | undefined): string | null {
  if (!tel) return null;
  const digits = normalizeText(tel).replace(/[^\d]/g, "");
  if (digits.length < 9) return null;
  return digits;
}

const PREF_PATTERNS = {
  "東京都": /東京都/,
  "神奈川県": /神奈川県/,
  "千葉県": /千葉県/,
  "埼玉県": /埼玉県/,
} as const;

export type Pref = keyof typeof PREF_PATTERNS;

export function extractPref(text: string): Pref | null {
  for (const [pref, pattern] of Object.entries(PREF_PATTERNS) as [Pref, RegExp][]) {
    if (pattern.test(text)) return pref;
  }
  return null;
}

export function extractCity(addr: string, pref: Pref): string | null {
  const re = new RegExp(`${pref}([^0-9\\-\\s]+?[市区町村])`);
  const m = addr.match(re);
  if (m) return m[1];
  const re2 = new RegExp(`${pref}(さいたま市[^0-9\\-\\s]+?区|横浜市[^0-9\\-\\s]+?区|川崎市[^0-9\\-\\s]+?区|千葉市[^0-9\\-\\s]+?区|相模原市[^0-9\\-\\s]+?区)`);
  const m2 = addr.match(re2);
  return m2?.[1] ?? null;
}

const ADDRESS_PREFIX_NOISE = /(?:場所は|所在地は?|住所[:：]?|Address[:：]?\s*|店舗情報[:：]?\s*)/g;
const ADDRESS_RE = /((?:東京都|神奈川県|千葉県|埼玉県)[^\s、。]+?\d+[\d\-ー―－]*(?:番地?\d*)?(?:号)?[^\s、。]*)/;
const CITY_ADDRESS_RE = /([一-龥々]{1,8}(?:市|区|町|村))([一-龥ぁ-んァ-ヶー々]{1,12}\d+[\d\-ー―－]*(?:番地?\d*)?(?:号)?)/;

export function extractAddress(text: string, fallbackPref?: Pref): string | null {
  const cleaned = text.replace(ADDRESS_PREFIX_NOISE, "");
  const m = cleaned.match(ADDRESS_RE);
  if (m) return normalizeText(m[1]);
  if (fallbackPref) {
    const m2 = cleaned.match(CITY_ADDRESS_RE);
    if (m2) return normalizeText(fallbackPref + m2[1] + m2[2]);
  }
  return null;
}

const TEL_RE = /(?:TEL|Tel|電話|☎|📞)?\s*[:：]?\s*(0\d{1,4}[-−ー―]?\d{1,4}[-−ー―]?\d{3,4})/;

export function extractTel(text: string): string | null {
  const m = text.match(TEL_RE);
  return m ? normalizeTel(m[1]) : null;
}

const OPEN_DATE_RES = [
  /(\d{4})[年\/\-\.](\d{1,2})[月\/\-\.](\d{1,2})日?(?:に?\s*(?:オープン|OPEN|開店|開業))/,
  /(?:オープン日?[:：]?\s*|OPEN[:：]?\s*)(\d{4})[年\/\-\.](\d{1,2})[月\/\-\.](\d{1,2})/,
  /(\d{1,2})月(\d{1,2})日\s*(?:に?\s*(?:オープン|OPEN|開店|開業))/,
];

export function extractOpenDate(text: string, articleYear?: number): string | null {
  for (const re of OPEN_DATE_RES) {
    const m = text.match(re);
    if (!m) continue;
    if (m.length === 4) {
      const y = Number(m[1]);
      const mo = Number(m[2]).toString().padStart(2, "0");
      const d = Number(m[3]).toString().padStart(2, "0");
      return `${y}-${mo}-${d}`;
    }
    if (m.length === 3 && articleYear) {
      const mo = Number(m[1]).toString().padStart(2, "0");
      const d = Number(m[2]).toString().padStart(2, "0");
      return `${articleYear}-${mo}-${d}`;
    }
  }
  return null;
}

const GENRE_KEYWORDS: Array<[string, string[]]> = [
  ["ラーメン", ["ラーメン", "らーめん", "中華そば", "つけ麺"]],
  ["カフェ", ["カフェ", "Cafe", "CAFE", "コーヒー", "喫茶"]],
  ["ベーカリー", ["ベーカリー", "パン", "ブーランジェリー", "Boulangerie"]],
  ["居酒屋", ["居酒屋", "酒場", "バル", "串", "やきとり", "焼鳥", "やきとん"]],
  ["焼肉", ["焼肉", "ホルモン", "ヤキニク"]],
  ["寿司", ["寿司", "鮨", "すし"]],
  ["イタリアン", ["イタリアン", "Italian", "Osteria", "オステリア", "パスタ", "ピッツァ"]],
  ["フレンチ", ["フレンチ", "French", "ビストロ", "Bistro"]],
  ["中華", ["中華", "餃子", "四川", "台湾料理"]],
  ["韓国料理", ["韓国", "ハングル", "サムギョプサル"]],
  ["タイ料理", ["タイ料理", "Thai"]],
  ["カレー", ["カレー", "Curry"]],
  ["スイーツ", ["スイーツ", "ケーキ", "パティスリー", "ジェラート"]],
  ["和菓子", ["和菓子"]],
  ["そば", ["そば", "蕎麦"]],
  ["うどん", ["うどん"]],
  ["定食", ["定食"]],
];

export function extractGenre(text: string): string | null {
  for (const [genre, kws] of GENRE_KEYWORDS) {
    for (const kw of kws) if (text.includes(kw)) return genre;
  }
  return null;
}

const STORE_NAME_NEGATIVE = ["オープン", "OPEN", "開店", "新店", "紹介", "情報"];

const TRAILING_PATTERNS = [
  /[、。]?\s*\d{1,4}年\d{1,2}月\d{1,2}日\s*(?:オープン|OPEN|開店|開業|グランドオープン)(?:予定)?[！!？?。]*\s*$/,
  /[、。]?\s*\d{1,2}月\d{1,2}日\s*(?:オープン|OPEN|開店|開業|グランドオープン)(?:予定)?[！!？?。]*\s*$/,
  /[、。]?\s*\d{1,2}月\s*(?:オープン|OPEN|開店|開業|グランドオープン)(?:予定)?[！!？?。]*\s*$/,
  /[、。]?\s*(?:に|で|へ|が|は|を)?\s*(?:新規)?(?:オープン|OPEN|開店|開業|グランドオープン)(?:予定|へ)?[！!？?。]*\s*$/,
];

export function extractStoreName(title: string): string | null {
  let cleaned = normalizeText(title)
    .replace(/【[^】]*】\s*/g, "")
    .replace(/^\s*\d+[\.、]\s*/, "")
    .trim();

  const quote = cleaned.match(/「([^」]+)」|『([^』]+)』/);
  if (quote) {
    const inner = (quote[1] ?? quote[2]).trim();
    if (inner.length >= 2 && !STORE_NAME_NEGATIVE.includes(inner)) return inner;
  }

  let prev = "";
  while (cleaned !== prev) {
    prev = cleaned;
    for (const re of TRAILING_PATTERNS) cleaned = cleaned.replace(re, "").trim();
  }

  cleaned = cleaned.replace(/[、。]?\s*(?:注目|話題|大人気)\s*$/, "").trim();

  for (const neg of STORE_NAME_NEGATIVE) {
    if (cleaned === neg) return null;
  }
  return cleaned || null;
}

export function isOpeningArticle(title: string, content: string): boolean {
  const text = `${title} ${content}`;
  const openKw = /(オープン|OPEN|開店|開業|新規オープン|新店)/.test(text);
  const closeKw = /(閉店|閉業|ラストデー)/.test(text);
  if (closeKw && !openKw) return false;
  return openKw;
}
