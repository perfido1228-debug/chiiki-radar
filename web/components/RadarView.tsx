"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RadarMeta, SortMode, Store } from "@/lib/types";
import { GENRE_COLORS } from "@/lib/genres";
import { unpack, type Packed } from "@/lib/compact";

const HIDDEN_KEY = "chiiki-radar-hidden-ids";
// NEW表示の基準（前回見た時刻）を覚えておく
const VISIT_KEY = "chiiki-radar-visit";
// 一度に描くカードの枚数（全件を一気に描くと重くなるので、スクロールに合わせて追加する）
const PAGE_SIZE = 60;
const DAY = 86400000;
// 最終取込からこれ以上たっていたら警告を出す
const STALE_HOURS = 8;

type Props = {
  data: Packed;
  pinnedPref?: string;
  meta: RadarMeta;
};

const PREF_ORDER = ["東京都", "神奈川県", "千葉県", "埼玉県", "愛知県", "大阪府", "京都府"];

const jstFormat = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

// 日本時間の日付（YYYY-MM-DD）
function jstDate(ms: number): string {
  return new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

// 2つの日付（YYYY-MM-DD）の差（日数）。b が後なら正
function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / DAY);
}

function formatOpenDate(openDate: string, today: string) {
  const diff = dayDiff(today, openDate);
  const md = openDate.slice(5).replace("-", "/");
  if (diff > 0) return { text: `🎉 ${md} オープン予定（あと${diff}日）`, future: true };
  if (diff === 0) return { text: `🎉 本日 ${md} オープン！`, future: true };
  if (diff >= -7) return { text: `🎉 ${md} オープン（${-diff}日前）`, future: false };
  return { text: `🎉 ${md} オープン`, future: false };
}

// 電話番号（数字のみで保存）を読みやすく区切る。区切り方が確実でない番号はそのまま
const AREA4 = ["0422", "0428", "0436", "0438", "0439", "0460", "0463", "0465", "0466", "0467", "0470", "0475", "0476", "0478", "0479", "0480", "0493", "0494", "0495", "0532", "0533", "0536", "0561", "0562", "0563", "0564", "0565", "0566", "0567", "0568", "0569", "0586", "0587", "0721", "0725", "0771", "0774"];
const AREA3 = ["042", "043", "044", "045", "046", "047", "048", "049", "052", "072", "075"];
function formatTel(tel: string): string {
  const d = tel.replace(/[^\d]/g, "");
  if (d.length === 11 && /^(?:050|070|080|090)/.test(d)) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 11 && d.startsWith("0800")) return `${d.slice(0, 4)}-${d.slice(4, 7)}-${d.slice(7)}`;
  if (d.length !== 10) return tel;
  if (/^(?:0120|0570)/.test(d)) return `${d.slice(0, 4)}-${d.slice(4, 7)}-${d.slice(7)}`;
  if (/^0[36]/.test(d)) return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6)}`;
  if (AREA4.includes(d.slice(0, 4))) return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`;
  if (AREA3.includes(d.slice(0, 3))) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return d;
}

function mapsUrl(d: Store): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${d.name} ${d.addr || `${d.pref}${d.city}`}`)}`;
}

// 検索用に表記をそろえる（全角半角・大文字小文字・空白の違いを無視）
function normalizeForSearch(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
}

function sortItems(items: Store[], mode: SortMode): Store[] {
  const cp = [...items];
  const newest = (a: Store, b: Store) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);
  switch (mode) {
    case "date-asc":
      return cp.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
    case "open-desc":
      return cp.sort((a, b) => (b.openDate || "0").localeCompare(a.openDate || "0") || newest(a, b));
    case "open-asc":
      return cp.sort((a, b) => (a.openDate || "9999").localeCompare(b.openDate || "9999") || newest(a, b));
    case "genre":
      return cp.sort((a, b) => a.genre.localeCompare(b.genre, "ja") || newest(a, b));
    case "pref":
      return cp.sort((a, b) => PREF_ORDER.indexOf(a.pref) - PREF_ORDER.indexOf(b.pref) || newest(a, b));
    default:
      return cp.sort(newest);
  }
}

function csvCell(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}

function downloadCsv(rows: Store[], label: string) {
  const header = ["店名", "記事タイトル", "ジャンル", "都道府県", "市区町村", "住所", "電話番号", "最寄駅", "オープン日", "掲載日", "情報元", "記事URL", "ほかの記事URL", "取込日時", "重複の可能性"];
  const lines = rows.map((d) => {
    const tel = d.tel ? formatTel(d.tel) : "";
    return [
      d.name,
      d.articleTitle ?? "",
      d.genre,
      d.pref,
      d.city,
      d.addr,
      // 区切りのない番号は Excel で先頭の0が消えるので文字列として書く
      tel && !tel.includes("-") ? `="${tel}"` : tel,
      d.nearestStation ?? "",
      d.openDate,
      d.date,
      d.sources[0]?.name ?? "",
      d.sources[0]?.url ?? "",
      d.sources.slice(1).map((s) => s.url).join(" "),
      jstFormat.format(new Date(d.createdAt)),
      d.duplicateFlag ? "あり" : "",
    ]
      .map((v, i) => (i === 6 && v.startsWith("=") ? v : csvCell(v)))
      .join(",");
  });
  // 先頭の BOM は Excel で文字化けしないため
  const BOM = String.fromCharCode(0xfeff);
  const blob = new Blob([BOM + [header.map(csvCell).join(","), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `地域密着レーダー_${label}_${jstDate(Date.now()).replace(/-/g, "")}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export default function RadarView({ data, pinnedPref, meta }: Props) {
  const stores = useMemo(() => unpack(data), [data]);
  const [prefFilter, setPrefFilter] = useState<string>(pinnedPref ?? "");
  const [cityFilter, setCityFilter] = useState<string>("");
  const [dateFilter, setDateFilter] = useState<string>("");
  const [genreFilter, setGenreFilter] = useState<string>("");
  const [srcFilter, setSrcFilter] = useState<string>("");
  const [srcNameFilter, setSrcNameFilter] = useState<string>("");
  const [sortMode, setSortMode] = useState<SortMode>("date-desc");
  const [query, setQuery] = useState<string>("");
  const [onlyNew, setOnlyNew] = useState<boolean>(false);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [showHidden, setShowHidden] = useState<boolean>(false);
  const [requireTel, setRequireTel] = useState<boolean>(false);
  const [requireAddr, setRequireAddr] = useState<boolean>(false);
  // 「今日」は最初はページを作った日時で描き、表示後にこの端末の時刻に合わせる（以前は 2026-04-23 に固定されていた）
  const [nowMs, setNowMs] = useState<number>(() => Date.parse(meta.generatedAt));
  // NEW の基準時刻（前回の閲覧）。読み込むまでは NEW を出さない
  const [newSince, setNewSince] = useState<number | null>(null);
  // 表示期間より前の店（「さらに古い店も読み込む」で追加）
  const [olderStores, setOlderStores] = useState<Store[]>([]);
  const [olderState, setOlderState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [visible, setVisible] = useState<{ key: string; n: number }>({ key: "", n: PAGE_SIZE });
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HIDDEN_KEY);
      if (raw) setHiddenIds(new Set(JSON.parse(raw)));
    } catch {}
  }, []);

  // 時計とNEWの基準。30分以上あいた再訪は「前回見たとき」以降をNEWにする（同じ作業中の再読み込みでは基準を変えない）
  useEffect(() => {
    const now = Date.now();
    setNowMs(now);
    let since = now - DAY;
    try {
      const raw = localStorage.getItem(VISIT_KEY);
      const v = raw ? (JSON.parse(raw) as { since?: number; lastActive?: number }) : null;
      if (v?.lastActive) since = now - v.lastActive > 30 * 60 * 1000 ? v.lastActive : v.since ?? v.lastActive;
      localStorage.setItem(VISIT_KEY, JSON.stringify({ since, lastActive: now }));
    } catch {}
    setNewSince(since);
    const timer = setInterval(() => {
      setNowMs(Date.now());
      try {
        localStorage.setItem(VISIT_KEY, JSON.stringify({ since, lastActive: Date.now() }));
      } catch {}
    }, 60000);
    return () => clearInterval(timer);
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

  const today = jstDate(nowMs);
  const effectivePref = pinnedPref ?? prefFilter;
  const allStores = useMemo(() => (olderStores.length ? [...stores, ...olderStores] : stores), [stores, olderStores]);
  const byId = useMemo(() => new Map(allStores.map((s) => [s.id, s])), [allStores]);
  const isNew = (d: Store) => newSince !== null && Date.parse(d.createdAt) > newSince;

  const searchIndex = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of allStores) {
      m.set(
        d.id,
        normalizeForSearch(
          [d.name, d.articleTitle ?? "", d.addr, d.pref, d.city, d.nearestStation ?? "", d.tel, d.genre, ...d.sources.map((s) => `${s.name} ${s.title ?? ""}`)].join(" "),
        ),
      );
    }
    return m;
  }, [allStores]);

  const cityOptions = useMemo(() => {
    const cities = allStores.filter((d) => !effectivePref || d.pref === effectivePref).map((d) => d.city);
    return [...new Set(cities)].sort();
  }, [allStores, effectivePref]);

  const genreOptions = useMemo(() => [...new Set(allStores.map((d) => d.genre))].sort(), [allStores]);

  const srcNameOptions = useMemo(() => {
    const names = new Set<string>();
    allStores.forEach((s) => s.sources.forEach((src) => src.name && names.add(src.name)));
    return [...names].sort();
  }, [allStores]);

  const newCount = useMemo(
    () => (newSince === null ? 0 : allStores.filter((d) => (!effectivePref || d.pref === effectivePref) && Date.parse(d.createdAt) > newSince).length),
    [allStores, effectivePref, newSince],
  );

  const filteredItems = useMemo(() => {
    const q = normalizeForSearch(query);
    const words = q ? query.normalize("NFKC").toLowerCase().split(/\s+/).filter(Boolean) : [];
    const filtered = allStores.filter((d) => {
      if (effectivePref && d.pref !== effectivePref) return false;
      if (cityFilter && d.city !== cityFilter) return false;
      if (dateFilter && dayDiff(d.date, today) > Number(dateFilter)) return false;
      if (genreFilter && d.genre !== genreFilter) return false;
      if (srcFilter && !d.sources.some((s) => s.type === srcFilter)) return false;
      if (srcNameFilter && !d.sources.some((s) => s.name === srcNameFilter)) return false;
      if (requireTel && !d.tel) return false;
      if (requireAddr && !d.addr) return false;
      if (onlyNew && !(newSince !== null && Date.parse(d.createdAt) > newSince)) return false;
      if (!showHidden && hiddenIds.has(d.id)) return false;
      if (words.length) {
        const hay = searchIndex.get(d.id) ?? "";
        if (!words.every((w) => hay.includes(w))) return false;
      }
      return true;
    });
    return sortItems(filtered, sortMode);
  }, [allStores, effectivePref, cityFilter, dateFilter, genreFilter, srcFilter, srcNameFilter, requireTel, requireAddr, onlyNew, newSince, sortMode, today, hiddenIds, showHidden, query, searchIndex]);

  const hiddenCount = useMemo(() => allStores.filter((s) => hiddenIds.has(s.id)).length, [allStores, hiddenIds]);

  // 絞り込みが変わったら、描く枚数を最初に戻す
  const filterKey = [effectivePref, cityFilter, dateFilter, genreFilter, srcFilter, srcNameFilter, sortMode, query, onlyNew, requireTel, requireAddr, showHidden].join("|");
  const visibleCount = visible.key === filterKey ? visible.n : PAGE_SIZE;
  const shown = filteredItems.slice(0, visibleCount);
  const showMore = () => setVisible({ key: filterKey, n: visibleCount + PAGE_SIZE });

  // 一覧の終わりが見えたら次のカードを足す
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || visibleCount >= filteredItems.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setVisible({ key: filterKey, n: visibleCount + PAGE_SIZE });
      },
      { rootMargin: "800px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [filterKey, visibleCount, filteredItems.length]);

  const reset = () => {
    if (!pinnedPref) setPrefFilter("");
    setCityFilter("");
    setDateFilter("");
    setGenreFilter("");
    setSrcFilter("");
    setSrcNameFilter("");
    setQuery("");
    setOnlyNew(false);
    setRequireTel(false);
    setRequireAddr(false);
    setSortMode("date-desc");
  };

  const loadOlder = async () => {
    setOlderState("loading");
    try {
      const got: Store[] = [];
      let offset: number | null = 0;
      while (offset !== null) {
        const params = new URLSearchParams({ offset: String(offset) });
        if (pinnedPref) params.set("pref", pinnedPref);
        const res = await fetch(`/api/stores?${params}`);
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { data: Packed; nextOffset: number | null };
        got.push(...unpack(body.data));
        offset = body.nextOffset;
      }
      setOlderStores(got);
      setOlderState("done");
    } catch {
      setOlderState("error");
    }
  };

  const lastCrawled = meta.lastCrawledAt ? Date.parse(meta.lastCrawledAt) : null;
  const crawledHoursAgo = lastCrawled ? (nowMs - lastCrawled) / 3600000 : null;
  const stale = crawledHoursAgo !== null && crawledHoursAgo >= STALE_HOURS;
  const agoText =
    crawledHoursAgo === null ? "" : crawledHoursAgo < 1 ? `${Math.max(0, Math.round(crawledHoursAgo * 60))}分前` : crawledHoursAgo < 48 ? `${Math.floor(crawledHoursAgo)}時間前` : `${Math.floor(crawledHoursAgo / 24)}日前`;

  return (
    <>
      <div className="filters">
        <label className="search">
          キーワード
          <input
            type="search"
            value={query}
            placeholder="店名・住所・記事タイトル・駅など"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
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
              {PREF_ORDER.map((p) => (
                <option key={p}>{p}</option>
              ))}
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
            <option value="0">今日</option>
            <option value="3">3日以内</option>
            <option value="7">1週間以内</option>
            <option value="30">1ヶ月以内</option>
            <option value="90">3ヶ月以内</option>
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
        <label className="toggle-filter new-filter">
          <input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} />
          NEWのみ{newCount > 0 ? `（${newCount}）` : ""}
        </label>
        <label className="toggle-filter">
          <input type="checkbox" checked={requireAddr} onChange={(e) => setRequireAddr(e.target.checked)} />
          住所あり
        </label>
        <label className="toggle-filter">
          <input type="checkbox" checked={requireTel} onChange={(e) => setRequireTel(e.target.checked)} />
          電話あり
        </label>
        <button className="reset" onClick={reset}>
          リセット
        </button>
        <button
          className="csv"
          onClick={() => downloadCsv(filteredItems, pinnedPref ?? (prefFilter || "全エリア"))}
          disabled={filteredItems.length === 0}
          title="いま絞り込んでいる店をすべて CSV（Excelで開けます）で保存します"
        >
          CSV出力
        </button>
        {hiddenCount > 0 && (
          <label className="show-hidden">
            <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} />
            除外済みも表示（{hiddenCount}件）
          </label>
        )}
        <div className="count">
          <b>{filteredItems.length}</b>件
          {lastCrawled && (
            <span className={`crawled${stale ? " stale" : ""}`} title={`最終取込 ${jstFormat.format(new Date(lastCrawled))}`}>
              最終取込 {jstFormat.format(new Date(lastCrawled))}（{agoText}）
            </span>
          )}
        </div>
      </div>

      <main>
        {stale && (
          <div className="stale-banner">
            ⚠ 自動取込が{agoText.replace("前", "")}止まっています。GitHub の自動実行が停止している可能性があります（
            <a href="/sources">情報源の状況</a>
            で確認できます）。
          </div>
        )}
        {filteredItems.length === 0 ? (
          <div className="empty">該当する開店情報はありません</div>
        ) : (
          <div className="grid">
            {shown.map((d) => {
              const bg = GENRE_COLORS[d.genre] || "#6b7280";
              const srcMain = d.sources[0];
              const openInfo = d.openDate ? formatOpenDate(d.openDate, today) : null;
              const isHidden = hiddenIds.has(d.id);
              const dupOf = d.duplicateOfId ? byId.get(d.duplicateOfId) : undefined;
              return (
                <div className={`card${isHidden ? " hidden-card" : ""}`} key={d.id}>
                  <div className="card-header" style={{ borderLeft: `4px solid ${bg}` }}>
                    <span className="genre-badge" style={{ background: bg }}>
                      {d.genre}
                    </span>
                    {isNew(d) && <span className="new-badge">NEW</span>}
                    <span className="date-badge">掲載 {d.date.slice(5).replace("-", "/")}</span>
                    <label
                      className={`unneeded-toggle${isHidden ? " checked" : ""}`}
                      title={isHidden ? "非表示中（クリックで戻す）" : "クリックで非表示に"}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input type="checkbox" checked={isHidden} onChange={() => toggleHidden(d.id)} />
                      <span>{isHidden ? "✓ 不要" : "不要"}</span>
                    </label>
                  </div>
                  <div className="body">
                    <h3>
                      {srcMain ? (
                        <a href={srcMain.url} target="_blank" rel="noopener noreferrer" className="title-link">
                          {d.articleTitle || d.name}
                        </a>
                      ) : (
                        d.name
                      )}
                    </h3>
                    {openInfo && <div className={`opendate${openInfo.future ? " future" : ""}`}>{openInfo.text}</div>}
                    {d.articleTitle && d.name && d.name !== d.articleTitle && (
                      <div className="store-name">
                        🏪 <b>{d.name}</b>
                      </div>
                    )}
                    {d.duplicateFlag && (
                      <div className="dup-flag">
                        ⚠️ 重複の可能性あり（類似店舗あり）
                        {dupOf && (
                          <button type="button" className="dup-link" onClick={() => setQuery(dupOf.name)}>
                            → {dupOf.name}（{dupOf.city}）と見比べる
                          </button>
                        )}
                      </div>
                    )}
                    <div className="addr">{d.addr || (d.nearestStation ? `🚃 最寄: ${d.nearestStation}` : "住所未抽出")}</div>
                    {d.addr && d.nearestStation && <div className="station">🚃 最寄: {d.nearestStation}</div>}
                    <div className={`tel${d.tel ? "" : " empty"}`}>{d.tel ? `📞 ${formatTel(d.tel)}` : "電話番号記載なし"}</div>
                    <div className="tags">
                      <span className="tag pref">{d.pref}</span>
                      <span className="tag">{d.city}</span>
                    </div>
                  </div>
                  <div className="footer">
                    <div className="sources">
                      📰 {srcMain?.name ?? "情報元なし"}
                      {d.sources.length > 1 && (
                        <details className="more-sources">
                          <summary className="src-count">+{d.sources.length - 1}件</summary>
                          <ul>
                            {d.sources.slice(1).map((s) => (
                              <li key={s.url}>
                                <a href={s.url} target="_blank" rel="noopener noreferrer">
                                  {s.name}：{s.title ?? s.url}
                                </a>
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </div>
                    <div className="actions">
                      <a className="map-btn" href={mapsUrl(d)} target="_blank" rel="noopener noreferrer" title="Googleマップで店を探す（電話番号・営業時間の確認に）">
                        地図
                      </a>
                      {srcMain && (
                        <a className="open-btn" href={srcMain.url} target="_blank" rel="noopener noreferrer">
                          記事を開く
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {visibleCount < filteredItems.length && (
          <div className="more" ref={sentinelRef}>
            <button type="button" onClick={showMore}>
              さらに表示（残り {filteredItems.length - visibleCount} 件）
            </button>
          </div>
        )}
        {meta.olderCount > 0 && olderState !== "done" && visibleCount >= filteredItems.length && (
          <div className="more older">
            <button type="button" onClick={loadOlder} disabled={olderState === "loading"}>
              {olderState === "loading"
                ? "読み込み中…"
                : `掲載日が${meta.windowDays}日より前の店（${meta.olderCount}件）も読み込む`}
            </button>
            {olderState === "error" && <div className="older-error">読み込みに失敗しました。少し待ってからもう一度お試しください。</div>}
          </div>
        )}
      </main>
    </>
  );
}
