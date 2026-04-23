"use client";

import { useMemo, useState } from "react";
import type { Store, SortMode } from "@/lib/types";
import { GENRE_COLORS } from "@/lib/mockData";

type Props = {
  stores: Store[];
  pinnedPref?: string;
};

const PREF_ORDER = ["東京都", "神奈川県", "千葉県", "埼玉県"];

function formatOpenDate(openDate: string, today: Date) {
  const od = new Date(openDate);
  const diff = Math.round((od.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const md = openDate.slice(5).replace("-", "/");
  if (diff > 0) return { text: `🎉 ${md} オープン予定（あと${diff}日）`, future: true };
  if (diff === 0) return { text: `🎉 本日 ${md} オープン！`, future: true };
  if (diff >= -7) return { text: `🎉 ${md} オープン（${-diff}日前）`, future: false };
  return { text: `🎉 ${md} オープン`, future: false };
}

function sortItems(items: Store[], mode: SortMode): Store[] {
  const cp = [...items];
  switch (mode) {
    case "date-asc":
      return cp.sort((a, b) => a.date.localeCompare(b.date));
    case "open-desc":
      return cp.sort((a, b) => (b.openDate || "0").localeCompare(a.openDate || "0"));
    case "open-asc":
      return cp.sort((a, b) => (a.openDate || "9999").localeCompare(b.openDate || "9999"));
    case "genre":
      return cp.sort(
        (a, b) =>
          a.genre.localeCompare(b.genre, "ja") || b.date.localeCompare(a.date)
      );
    case "pref":
      return cp.sort(
        (a, b) =>
          PREF_ORDER.indexOf(a.pref) - PREF_ORDER.indexOf(b.pref) ||
          b.date.localeCompare(a.date)
      );
    default:
      return cp.sort((a, b) => b.date.localeCompare(a.date));
  }
}

export default function RadarView({ stores, pinnedPref }: Props) {
  const [prefFilter, setPrefFilter] = useState<string>(pinnedPref ?? "");
  const [cityFilter, setCityFilter] = useState<string>("");
  const [dateFilter, setDateFilter] = useState<string>("");
  const [genreFilter, setGenreFilter] = useState<string>("");
  const [srcFilter, setSrcFilter] = useState<string>("");
  const [srcNameFilter, setSrcNameFilter] = useState<string>("");
  const [sortMode, setSortMode] = useState<SortMode>("date-desc");

  const today = useMemo(() => new Date("2026-04-23"), []);

  const effectivePref = pinnedPref ?? prefFilter;

  const cityOptions = useMemo(() => {
    const cities = stores
      .filter((d) => !effectivePref || d.pref === effectivePref)
      .map((d) => d.city);
    return [...new Set(cities)].sort();
  }, [stores, effectivePref]);

  const genreOptions = useMemo(() => {
    return [...new Set(stores.map((d) => d.genre))].sort();
  }, [stores]);

  const srcNameOptions = useMemo(() => {
    const names = new Set<string>();
    stores.forEach((s) => s.sources.forEach((src) => names.add(src.name)));
    return [...names].sort();
  }, [stores]);

  const filteredItems = useMemo(() => {
    const filtered = stores.filter((d) => {
      if (effectivePref && d.pref !== effectivePref) return false;
      if (cityFilter && d.city !== cityFilter) return false;
      if (dateFilter) {
        const diff = (today.getTime() - new Date(d.date).getTime()) / (1000 * 60 * 60 * 24);
        if (diff > Number(dateFilter)) return false;
      }
      if (genreFilter && d.genre !== genreFilter) return false;
      if (srcFilter && !d.sources.some((s) => s.type === srcFilter)) return false;
      if (srcNameFilter && !d.sources.some((s) => s.name === srcNameFilter)) return false;
      return true;
    });
    return sortItems(filtered, sortMode);
  }, [stores, effectivePref, cityFilter, dateFilter, genreFilter, srcFilter, srcNameFilter, sortMode, today]);

  const reset = () => {
    if (!pinnedPref) setPrefFilter("");
    setCityFilter("");
    setDateFilter("");
    setGenreFilter("");
    setSrcFilter("");
    setSrcNameFilter("");
    setSortMode("date-desc");
  };

  return (
    <>
      <div className="filters">
        {!pinnedPref && (
          <label>
            都道府県
            <select
              value={prefFilter}
              onChange={(e) => {
                setPrefFilter(e.target.value);
                setCityFilter("");
              }}
            >
              <option value="">すべて</option>
              <option>東京都</option>
              <option>神奈川県</option>
              <option>千葉県</option>
              <option>埼玉県</option>
            </select>
          </label>
        )}
        <label>
          市区町村
          <select value={cityFilter} onChange={(e) => setCityFilter(e.target.value)}>
            <option value="">すべて</option>
            {cityOptions.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          掲載日
          <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}>
            <option value="">すべて</option>
            <option value="3">3日以内</option>
            <option value="7">1週間以内</option>
            <option value="30">1ヶ月以内</option>
          </select>
        </label>
        <label>
          ジャンル
          <select value={genreFilter} onChange={(e) => setGenreFilter(e.target.value)}>
            <option value="">すべて</option>
            {genreOptions.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        <label>
          情報元種別
          <select value={srcFilter} onChange={(e) => setSrcFilter(e.target.value)}>
            <option value="">すべて</option>
            <option>号外NET</option>
            <option>経済新聞</option>
            <option>独立系ブログ</option>
            <option>つうしん系</option>
            <option>ku2shin系</option>
          </select>
        </label>
        <label>
          情報元サイト
          <select value={srcNameFilter} onChange={(e) => setSrcNameFilter(e.target.value)}>
            <option value="">すべて</option>
            {srcNameOptions.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <label>
          並び順
          <select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}>
            <option value="date-desc">掲載日（新しい順）</option>
            <option value="date-asc">掲載日（古い順）</option>
            <option value="open-desc">オープン日（新しい順）</option>
            <option value="open-asc">オープン日（古い順）</option>
            <option value="genre">ジャンル順</option>
            <option value="pref">都道府県順</option>
          </select>
        </label>
        <button className="reset" onClick={reset}>
          リセット
        </button>
        <div className="count">
          <b>{filteredItems.length}</b>件
        </div>
      </div>

      <main>
        {filteredItems.length === 0 ? (
          <div className="empty">該当する開店情報はありません</div>
        ) : (
          <div className="grid">
            {filteredItems.map((d, i) => {
              const bg = GENRE_COLORS[d.genre] || "#6b7280";
              const srcMain = d.sources[0];
              const openInfo = d.openDate ? formatOpenDate(d.openDate, today) : null;
              return (
                <div className="card" key={(d.id ?? `${d.name}-${d.addr}`) + i}>
                  <div
                    className="thumb"
                    style={{ background: `linear-gradient(135deg, ${bg}dd, ${bg}88)` }}
                  >
                    <span className="genre">{d.genre}</span>
                    <span className="date">掲載 {d.date.slice(5).replace("-", "/")}</span>
                    <span className="emoji">🍽️</span>
                  </div>
                  <div className="body">
                    <h3>{d.articleTitle || d.name}</h3>
                    {openInfo && (
                      <div className={`opendate${openInfo.future ? " future" : ""}`}>
                        {openInfo.text}
                      </div>
                    )}
                    {d.articleTitle && d.name && d.name !== d.articleTitle && (
                      <div className="store-name">🏪 <b>{d.name}</b></div>
                    )}
                    {d.duplicateFlag && (
                      <div className="dup-flag">⚠️ 重複の可能性あり（類似店舗あり）</div>
                    )}
                    <div className="addr">{d.addr || "住所未抽出"}</div>
                    <div className={`tel${d.tel ? "" : " empty"}`}>
                      {d.tel ? `📞 ${d.tel}` : "電話番号記載なし"}
                    </div>
                    <div className="tags">
                      <span className="tag pref">{d.pref}</span>
                      <span className="tag">{d.city}</span>
                    </div>
                  </div>
                  <div className="footer">
                    <div className="sources">
                      📰 {srcMain.name}
                      {d.sources.length > 1 && (
                        <span className="src-count">+{d.sources.length - 1}件</span>
                      )}
                    </div>
                    <a
                      className="open-btn"
                      href={srcMain.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      記事を開く
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
