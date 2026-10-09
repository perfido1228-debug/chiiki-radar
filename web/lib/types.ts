export type SourceType = "号外NET" | "経済新聞" | "独立系ブログ" | "つうしん系" | "ku2shin系";

export type Pref = "東京都" | "神奈川県" | "千葉県" | "埼玉県" | "愛知県" | "大阪府" | "京都府";

// 店に紐づく記事（情報元）
export type Source = {
  name: string;
  url: string;
  type: SourceType;
  title?: string;
  publishedAt?: string;
};

export type Store = {
  id: string;
  name: string;
  articleTitle?: string;
  addr: string;
  pref: Pref;
  city: string;
  // 掲載日（最初に記事が出た日・日本時間）
  date: string;
  openDate: string;
  genre: string;
  tel: string;
  nearestStation?: string;
  sources: Source[];
  duplicateFlag?: boolean;
  duplicateOfId?: string;
  // レーダーに取り込んだ日時（NEW表示に使う）
  createdAt: string;
};

export type RadarMeta = {
  // ページを作った日時
  generatedAt: string;
  // 最後に情報源を巡回した日時
  lastCrawledAt: string | null;
  // 最初に読み込む期間（掲載日がこの日数以内の店）
  windowDays: number;
  // 期間より前の店の件数（「さらに古い店も読み込む」で取得）
  olderCount: number;
};

export type SortMode =
  | "date-desc"
  | "date-asc"
  | "open-desc"
  | "open-asc"
  | "genre"
  | "pref";
