"use client";

import { useEffect, useMemo, useState } from "react";
import type { Store, SortMode } from "@/lib/types";
import { GENRE_COLORS } from "@/lib/mockData";

const HIDDEN_KEY = "chiiki-radar-hidden-ids";

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
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [showHidden, setShowHidden] = useState<boolean>(false);
  const [requireTel, setRequireTel] = useState<boolean>(false);
  const [requireAddr, setRequireAddr] = useState<boolean>(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HIDDEN_KEY);
      if (raw) setHiddenIds(new Set(JSON.parse(raw)));
    } catch {}
  }, []);

  const toggleHidden = (id: string) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(HIDDEN_KEY, JSON.stringify([...next]));
      } catch {}
      return next;
    });
  };

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
      if (requireTel && !d.tel) return false;
      if (requireAddr && !d.addr) return false;
      if (!showHidden && d.id && hiddenIds.has(d.id)) return false;
      return true;
    });
    return sortItems(filtered, sortMode);
  }, [stores, effectivePref, cityFilter, dateFilter, genreFilter, srcFilter, srcNameFilter, requireTel, requireAddr, sortMode, today, hiddenIds, showHidden]);

  const hiddenCount = useMemo(() => {
    return stores.filter((s) => s.id && hiddenIds.has(s.id)).length;
  }, [stores, hiddenIds]);

  const reset = () => {
    if (!pinnedPref) setPrefFilter("");
    setCityFilter("");
    setDateFilter("");
    setGenreFilter("");
    setSrcFilter("");
    setSrcNameFilter("");
    setRequireTel(false);
    setRequireAddr(false);
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
        <label className="toggle-filter">
          <input
            type="checkbox"
            checked={requireAddr}
            onChange={(e) => setRequireAddr(e.target.checked)}
          />
          住所あり
        </label>
        <label className="toggle-filter">
          <input
            type="checkbox"
            checked={requireTel}
            onChange={(e) => setRequireTel(e.target.checked)}
          />
          電話あり
        </label>
        <button className="reset" onClick={reset}>
          リセット
        </button>
        {hiddenCount > 0 && (
          <label className="show-hidden">
            <input
              type="checkbox"
              checked={showHidden}
              onChange={(e) => setShowHidden(e.target.checked)}
            />
            除外済みも表示（{hiddenCount}件）
          </label>
        )}
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
              const storeKey = d.id ?? `${d.name}-${d.addr}`;
              const isHidden = d.id ? hiddenIds.has(d.id) : false;
              return (
                <div className={`card${isHidden ? " hidden-card" : ""}`} key={storeKey + i}>
                  <div
                    className="thumb"
                    style={{ background: `linear-gradient(135deg, ${bg}dd, ${bg}88)` }}
                  >
                    <span className="genre">{d.genre}</span>
                    <span className="date">掲載 {d.date.slice(5).replace("-", "/")}</span>
                    {d.id && (
                      <label
                        className={`unneeded-toggle${isHidden ? " checked" : ""}`}
                        title={isHidden ? "非表示中（クリックで戻す）" : "クリックで非表示に"}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={isHidden}
                          onChange={() => d.id && toggleHidden(d.id)}
                        />
                        <span>{isHidden ? "✓ 不要（非表示）" : "不要（非表示にする）"}</span>
                      </label>
                    )}
                    <span className="emoji">🍽️</span>
                  </div>
                  <div className="body">
                    <h3>
                      <a
                        href={srcMain.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="title-link"
                      >
                        {d.articleTitle || d.name}
                      </a>
                    </h3>
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
                    <div className="addr">
                      {d.addr || (d.nearestStation ? `🚃 最寄: ${d.nearestStation}` : "住所未抽出")}
                    </div>
                    {d.addr && d.nearestStation && (
                      <div className="station">🚃 最寄: {d.nearestStation}</div>
                    )}
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
