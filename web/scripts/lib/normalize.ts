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
const CITY_ADDRESS_RE = /(?<![一-龥ぁ-んァ-ヶー々])([一-龥々]{1,8}(?:市|区|町|村))([一-龥ぁ-んァ-ヶー々]{1,12}\d+[\d\-ー―－]*(?:番地?\d*)?(?:号)?)/;
const CHOME_RE = /(?<![一-龥ぁ-んァ-ヶー々])([一-龥々]{1,8}(?:市|区|町|村))([一-龥々]{1,6}(?:\d+|[一二三四五六七八九十])丁目)/;

export function extractAddress(text: string, fallbackPref?: Pref): string | null {
  const cleaned = text.replace(ADDRESS_PREFIX_NOISE, "");

  const full = cleaned.match(ADDRESS_RE);
  if (full) return normalizeText(full[1]);

  if (fallbackPref) {
    const city = cleaned.match(CITY_ADDRESS_RE);
    if (city) return normalizeText(fallbackPref + city[1] + city[2]);

    const chome = cleaned.match(CHOME_RE);
    if (chome) return normalizeText(fallbackPref + chome[1] + chome[2]);
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
  ["寿司", ["寿司", "鮨", "回転寿司"]],
  ["イタリアン", ["イタリアン", "Italian", "Osteria", "オステリア", "パスタ", "ピッツァ", "スパゲッティ", "スパゲティ", "ピザ", "ナポリタン", "五右衛門"]],
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

const NON_FOOD_KEYWORDS = [
  "美容室", "美容院", "ヘアサロン", "ヘアケア", "バーバー", "理容", "床屋",
  "ネイル", "ネイルサロン", "エステ", "エステサロン", "マッサージ",
  "リラクゼーション", "整体", "整骨", "接骨", "カイロプラクティック",
  "ホワイトニング", "歯科", "歯医者", "クリニック", "診療所", "医院", "耳鼻科", "眼科", "皮膚科",
  "薬局", "ドラッグストア", "ドラッグ",
  "メガネ", "眼鏡",
  "不動産", "リフォーム", "住宅展示", "モデルハウス", "工務店",
  "セレクトショップ", "アパレル", "古着", "ブティック", "衣料", "衣料品",
  "子ども服", "子供服", "こども服", "キッズウェア", "キッズ服",
  "ベビー服", "ベビーウェア", "マタニティウェア",
  "紳士服", "婦人服", "メンズ服", "レディース服",
  "ファッション", "ファッションブランド", "フラッグショップ", "旗艦店",
  "洋服店", "服飾", "アクセサリー", "ジュエリー", "時計店",
  "靴店", "シューズ", "バッグ", "鞄",
  "書店", "本屋", "古本",
  "100円ショップ", "100均", "ダイソー", "セリア", "キャンドゥ",
  "雑貨店", "生活雑貨", "インテリアショップ", "家具店",
  "フィットネス", "ジム", "ヨガスタジオ", "ピラティス",
  "学習塾", "塾", "英会話", "スクール", "教室", "予備校", "保育園", "幼稚園",
  "買取", "質屋", "リサイクルショップ",
  "パチンコ", "スロット", "ゲームセンター",
  "コインランドリー",
  "ペットショップ", "トリミング",
  "花屋", "フラワーショップ",
  "葬儀", "葬祭",
  "クリーニング店",
  "自動車販売", "カーディーラー", "中古車",
  "家電量販", "携帯ショップ",
];

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
  "家系", "ラーメン横綱", "スガキヤ",
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

const FOOD_INDICATORS = [
  "飲食店", "飲食", "食堂", "食事", "レストラン", "ランチ", "ディナー", "モーニング",
  "ラーメン", "中華そば", "つけ麺", "そば", "蕎麦", "うどん",
  "料理", "グルメ", "和食", "洋食", "中華", "和菓子", "洋菓子",
  "カフェ", "Cafe", "CAFE", "喫茶", "コーヒー", "珈琲",
  "パン", "ベーカリー", "ブーランジェリー",
  "居酒屋", "酒場", "バル", "ビストロ", "ダイニング",
  "焼肉", "焼鳥", "焼き鳥", "串焼き", "鉄板", "ホルモン",
  "寿司", "鮨", "すし",
  "イタリアン", "フレンチ", "韓国料理", "タイ料理", "ベトナム料理", "インド料理",
  "カレー",
  "スイーツ", "ケーキ", "パティスリー", "ジェラート", "クレープ", "アイス", "かき氷", "タピオカ",
  "テイクアウト", "フードコート", "キッチン", "厨房",
  "お弁当", "弁当",
  "餃子", "たこ焼き", "お好み焼き", "鉄板焼",
  "肉", "魚介", "海鮮",
  "サンドイッチ", "バーガー",
  "ワイン", "日本酒", "クラフトビール", "ハイボール",
  "定食",
];

const STATION_EXCLUDE = ["病院駅", "郵便駅"];

export function extractNearestStation(text: string): string | null {
  const re = /(?<![一-龥ぁ-んァ-ヶー々])([一-龥ぁ-んァ-ヶー々]{2,6}駅)/g;
  const seen = new Set<string>();
  const matches = [...text.matchAll(re)];
  for (const m of matches) {
    const station = m[1];
    if (STATION_EXCLUDE.some((ex) => station.endsWith(ex))) continue;
    if (station.length < 3) continue;
    if (seen.has(station)) continue;
    seen.add(station);
    return station;
  }
  return null;
}

const TITLE_STRONG_REJECTS = [
  "補助金", "助成金", "給付金", "支援金", "奨励金", "報奨金",
  "キャンペーン", "抽選", "プレゼント", "当選",
  "応募", "募集", "公募", "採用情報", "求人",
  "説明会", "セミナー", "講座", "講習", "ワークショップ",
  "イベント", "まつり", "祭り", "催事", "フェス",
  "中止", "終了", "締切", "締め切り", "期間限定終了",
  "改装", "リニューアル", "リフォーム",
  "移転", "引っ越し",
  "議会", "選挙", "行政", "条例", "法改正",
  "工事", "通行止め", "通行止", "規制",
  "注意", "警告", "被害",
  "ランキング", "まとめ", "特集",
  "インタビュー", "クイズ", "ランクイン", "第1位", "第一位", "TOP10", "ベスト",
  // 防犯・不審者関連
  "不審者", "防犯", "犯罪", "詐欺", "事件", "事故", "火災", "救急",
  // 不動産
  "マンション", "物件", "分譲", "賃貸", "住宅情報", "家賃",
  "売地", "売家", "中古住宅", "建売", "新築",
  // 医療・健康
  "健康診断", "予防接種", "ワクチン", "がん検診",
  // その他ノイズ
  "閉鎖", "閉校", "休業", "営業時間変更", "臨時休業",
  "総選挙", "議員",
];

const TITLE_OPENING_KEYWORDS = ["オープン", "OPEN", "開店", "開業", "新規オープン", "新店", "グランドオープン", "New Open", "NEW OPEN"];

export function isFoodOpening(title: string, content: string): boolean {
  const titleHasOpening = TITLE_OPENING_KEYWORDS.some((kw) => title.includes(kw));
  if (!titleHasOpening) return false;

  for (const kw of TITLE_STRONG_REJECTS) {
    if (title.includes(kw)) return false;
  }

  const closeKw = /(閉店|閉業|ラストデー|ラストオーダー終了)/.test(title);
  if (closeKw) return false;

  for (const kw of NON_FOOD_KEYWORDS) {
    if (title.includes(kw)) return false;
  }

  const text = `${title} ${content}`;
  for (const kw of NON_FOOD_KEYWORDS) {
    if (text.includes(kw)) return false;
  }

  const titleHasFood = FOOD_INDICATORS.some((kw) => title.includes(kw));
  if (titleHasFood) return true;

  for (const kw of FOOD_INDICATORS) {
    if (text.includes(kw)) return true;
  }
  return false;
}

export function isChainStore(title: string, content: string): boolean {
  const text = `${title} ${content}`;
  for (const kw of CHAIN_KEYWORDS) {
    if (text.includes(kw)) return true;
  }
  return false;
}
