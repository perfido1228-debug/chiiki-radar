// 地域密着レーダー（PC版）の画面。一覧は本番と同じ RadarView を使い、データはこのPCの中から読む。
import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import RadarView from "@/components/RadarView";
import type { Packed } from "@/lib/compact";
import type { RadarMeta } from "@/lib/types";

type Payload = { data: Packed; meta: RadarMeta; area: { name: string; prefectures: string[] } };
type Status = { crawling: boolean; lastRun: { finishedAt: string; summary: string; ok: boolean } | null; intervalMin: number; autoCrawl: boolean };

function App() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState<string>("");
  const [status, setStatus] = useState<Status | null>(null);
  const wasCrawling = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/data", { cache: "no-store" });
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
      const p = (await res.json()) as Payload;
      setPayload(p);
      document.title = `地域密着レーダー（${p.area.name}）`;
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  // 巡回の様子を見て、終わったら一覧を読み直す
  const poll = useCallback(async () => {
    try {
      const s = (await (await fetch("/api/status", { cache: "no-store" })).json()) as Status;
      if (wasCrawling.current && !s.crawling) load();
      wasCrawling.current = s.crawling;
      setStatus(s);
    } catch {
      setStatus(null);
    }
  }, [load]);

  useEffect(() => {
    load();
    poll();
    const t = setInterval(poll, 5000);
    return () => clearInterval(t);
  }, [load, poll]);

  const crawlNow = async () => {
    await fetch("/api/crawl", { method: "POST" });
    poll();
  };

  return (
    <>
      <header className="app-header">
        <h1>
          地域密着レーダー
          <span className="sub">{payload ? `${payload.area.name} の新規開店情報（PC版）` : "PC版"}</span>
        </h1>
        <div className="meta">
          {status?.autoCrawl ? `自動取込: ${status.intervalMin}分ごと（起動中）` : "自動取込: しない"}
          <a href="/sources" className="meta-link">
            情報源の状況
          </a>
          <button type="button" className="kit-crawl" onClick={crawlNow} disabled={!status || status.crawling}>
            {status?.crawling ? "巡回中…" : "今すぐ巡回"}
          </button>
        </div>
      </header>
      {status?.lastRun && !status.crawling && (
        <div className={`kit-lastrun${status.lastRun.ok ? "" : " ng"}`}>前回の巡回: {status.lastRun.summary}</div>
      )}
      {error ? (
        <main>
          <div className="empty">読み込めませんでした（{error}）</div>
        </main>
      ) : payload ? (
        <RadarView
          data={payload.data}
          meta={payload.meta}
          prefOrder={payload.area.prefectures}
          staleReason="このPCの電源が切れていたか、レーダーが起動していなかった可能性があります"
        />
      ) : (
        <main>
          <div className="empty">読み込んでいます…</div>
        </main>
      )}
    </>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
