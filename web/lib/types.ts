export type SourceType = "号外NET" | "経済新聞" | "独立系ブログ" | "つうしん系" | "ku2shin系";

export type Source = {
  name: string;
  url: string;
  type: SourceType;
};

export type Store = {
  id?: string;
  name: string;
  articleTitle?: string;
  addr: string;
  pref: "東京都" | "神奈川県" | "千葉県" | "埼玉県";
  city: string;
  date: string;
  openDate: string;
  genre: string;
  tel: string;
  nearestStation?: string;
  thumb: string;
  sources: Source[];
  duplicateFlag?: boolean;
  duplicateOfId?: string;
};

export type SortMode =
  | "date-desc"
  | "date-asc"
  | "open-desc"
  | "open-asc"
  | "genre"
  | "pref";
