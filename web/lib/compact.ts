// 画面に渡す店データを小さくまとめる（全件を普通の形で渡すとページが数MBになるため）。
// 情報元の名前・種別は一覧表にまとめ、店ごとには番号だけを持たせる。
import type { Pref, SourceType, Store } from "./types";

export const PREF_LIST: Pref[] = ["東京都", "神奈川県", "千葉県", "埼玉県", "愛知県", "大阪府", "京都府"];

type SrcRef = [name: string, type: SourceType];
// [id, 店名, 住所, 都府県番号, 市区町村, 掲載日, オープン日, ジャンル, 電話, 最寄駅, 重複の相手(0=なし/-1=相手不明), 取込日時(秒), 記事[[情報元番号, URL, 見出し]...]]
type Row = [number, string, string, number, string, string, string, string, string, string, number, number, Array<[number, string, string]>];

// p: 都府県の一覧（配布キットなど、7都府県以外を扱うときだけ入れる。無ければ PREF_LIST）
export type Packed = { s: SrcRef[]; r: Row[]; p?: string[] };

export function pack(stores: Store[], prefList?: string[]): Packed {
  const prefs: string[] = prefList ?? PREF_LIST;
  const index = new Map<string, number>();
  const s: SrcRef[] = [];
  const r: Row[] = stores.map((d) => [
    Number(d.id),
    d.name,
    d.addr,
    prefs.indexOf(d.pref),
    d.city,
    d.date,
    d.openDate,
    d.genre,
    d.tel,
    d.nearestStation ?? "",
    d.duplicateFlag ? (d.duplicateOfId ? Number(d.duplicateOfId) : -1) : 0,
    Math.floor(Date.parse(d.createdAt) / 1000),
    d.sources.map((src) => {
      const key = `${src.name}\t${src.type}`;
      let i = index.get(key);
      if (i === undefined) {
        i = s.length;
        index.set(key, i);
        s.push([src.name, src.type]);
      }
      return [i, src.url, src.title ?? ""] as [number, string, string];
    }),
  ]);
  return prefList ? { s, r, p: prefList } : { s, r };
}

export function unpack(p: Packed): Store[] {
  const prefs: string[] = p.p ?? PREF_LIST;
  return p.r.map(([id, name, addr, pref, city, date, openDate, genre, tel, station, dup, created, arts]) => {
    const sources = arts.map(([si, url, title]) => ({ name: p.s[si]?.[0] ?? "", type: p.s[si]?.[1] ?? "独立系ブログ", url, title }));
    return {
      id: String(id),
      name,
      articleTitle: sources[0]?.title || undefined,
      addr,
      pref: (prefs[pref] ?? "東京都") as Pref,
      city,
      date,
      openDate,
      genre,
      tel,
      nearestStation: station || undefined,
      sources,
      duplicateFlag: dup !== 0,
      duplicateOfId: dup > 0 ? String(dup) : undefined,
      createdAt: new Date(created * 1000).toISOString(),
    };
  });
}
