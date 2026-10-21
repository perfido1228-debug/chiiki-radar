// 地域密着レーダー（PC版）の画面と自動巡回。
// 使い方: node app/server.mjs [--open] [--port=4517] [--no-crawl]
//   --open      … ブラウザで画面を開く（すでに起動していれば画面を開くだけ）
//   --no-crawl  … 自動巡回をしない（試験用）
// この窓を開いている間、1時間ごとに情報源を巡回する。
import { spawn } from "child_process";
import { createWriteStream, existsSync, readFileSync, renameSync, statSync } from "fs";
import http from "http";
import { loadArea } from "./area";
import { buildPayload, lastCrawledAt, purgeOld, sourceStats } from "./data";
import { KIT_ROOT, P } from "./paths";

const args = process.argv.slice(2);
const PORT = Number(process.env.KIT_PORT ?? args.find((a) => a.startsWith("--port="))?.split("=")[1] ?? 4517);
const OPEN = args.includes("--open");
const NO_CRAWL = args.includes("--no-crawl");
const INTERVAL_MIN = Number(process.env.KIT_CRAWL_INTERVAL_MIN ?? 60);
const URL_BASE = `http://localhost:${PORT}`;

let crawling = false;
let lastRun: { finishedAt: string; summary: string; ok: boolean } | null = null;
// 最後に巡回を始めた時刻（ネットにつながらず失敗し続けても、1時間に1回までしか試さない）
let lastAttempt = 0;

function openBrowser(url: string) {
  const cmd = process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  spawn(cmd[0] as string, cmd[1] as string[], { detached: true, stdio: "ignore" }).unref();
}

function startCrawl(reason: string): boolean {
  if (crawling || !loadArea()) return false;
  crawling = true;
  lastAttempt = Date.now();
  const logFile = P.data("crawl.log");
  if (existsSync(logFile) && statSync(logFile).size > 5 * 1024 * 1024) renameSync(logFile, P.data("crawl.old.log"));
  const log = createWriteStream(logFile, { flags: "a" });
  log.write(`\n===== ${new Date().toLocaleString("ja-JP")}（${reason}）\n`);
  console.log(`${new Date().toLocaleTimeString("ja-JP")} 巡回を始めます（${reason}）`);
  const child = spawn(process.execPath, [P.app("crawl.mjs"), "--max-pages=30", "--concurrency=6"], { cwd: KIT_ROOT });
  let tail = "";
  const onData = (b: Buffer) => {
    log.write(b);
    tail = (tail + b.toString()).slice(-4000);
  };
  child.stdout.on("data", onData);
  child.stderr.on("data", onData);
  child.on("close", (code) => {
    crawling = false;
    const m = tail.match(/新しい店: (\d+) 件 \/ 既存の店に記事を追加: (\d+) 件/);
    const failed = tail.match(/取得失敗 (\d+) 件/);
    const summary = m ? `新しい店 ${m[1]}件・既存の店に記事 ${m[2]}件${failed && failed[1] !== "0" ? `（取得できなかった情報源 ${failed[1]}件）` : ""}` : code === 0 ? "完了" : "うまくいきませんでした（data/crawl.log を見てください）";
    lastRun = { finishedAt: new Date().toISOString(), summary, ok: code === 0 };
    try {
      const p = purgeOld();
      if (p.stores || p.articles) log.write(`2年より前の店 ${p.stores}件・記事 ${p.articles}件を消しました\n`);
    } catch (e) {
      log.write(`古いデータの削除に失敗: ${(e as Error).message}\n`);
    }
    log.end();
    console.log(`${new Date().toLocaleTimeString("ja-JP")} 巡回が終わりました: ${summary}`);
  });
  return true;
}

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

function sendFile(res: http.ServerResponse, file: string, type: string) {
  if (!existsSync(file)) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("見つかりません");
    return;
  }
  res.writeHead(200, { "content-type": type, "cache-control": "no-cache" });
  res.end(readFileSync(file));
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

function page(title: string, body: string): string {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><link rel="stylesheet" href="/app.css"></head><body>
<header class="app-header"><h1>地域密着レーダー<span class="sub">${esc(title)}</span></h1><div class="meta"><a href="/" class="meta-link">一覧に戻る</a></div></header>
<main class="kit-page">${body}</main></body></html>`;
}

function sourcesPage(): string {
  const rows = sourceStats();
  const order = ["まだ巡回していない", "開店記事なし（180日以上）", "開店記事なし", "少ない（60日以上なし）", "正常", "止めている"];
  rows.sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || a.name.localeCompare(b.name, "ja"));
  const tr = rows
    .map(
      (r) =>
        `<tr><td>${esc(r.id)}</td><td><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.name)}</a></td><td>${esc(r.pref)}${esc(r.city)}</td><td>${esc(r.status)}</td><td>${fmt(r.crawled)}</td><td>${r.lastOpen ? esc(r.lastOpen.slice(0, 10)) : "—"}</td><td>${r.withStore} / ${r.articles}</td></tr>`,
    )
    .join("");
  return page(
    "情報源の状況",
    `<p>情報源は <code>config/sources.json</code> に入っています。足したり止めたりするときは、Claude に頼んでください（CLAUDE.md に手順があります）。</p>
<table class="kit-table"><thead><tr><th>番号</th><th>情報源</th><th>担当地域</th><th>状況</th><th>前回の巡回</th><th>最後の開店記事</th><th>店になった記事 / 記事</th></tr></thead><tbody>${tr || `<tr><td colspan="7">情報源がまだありません</td></tr>`}</tbody></table>`,
  );
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", URL_BASE);
  try {
    if (req.method === "POST" && url.pathname === "/api/crawl") {
      return sendJson(res, 200, { started: startCrawl("手動"), crawling: true });
    }
    switch (url.pathname) {
      case "/":
        if (!loadArea()) {
          res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
          return res.end(page("まだ地域が設定されていません", `<p>はじめに.txt の手順で、Claude に「このキットを設定して」と頼んでください。</p>`));
        }
        return sendFile(res, P.ui("index.html"), "text/html; charset=utf-8");
      case "/app.js":
        return sendFile(res, P.ui("app.js"), "text/javascript; charset=utf-8");
      case "/app.css":
        return sendFile(res, P.ui("app.css"), "text/css; charset=utf-8");
      case "/api/data": {
        const area = loadArea();
        if (!area) return sendJson(res, 409, { error: "地域が設定されていません" });
        return sendJson(res, 200, buildPayload(area));
      }
      case "/api/status":
        return sendJson(res, 200, { crawling, lastRun, lastCrawledAt: lastCrawledAt(), intervalMin: INTERVAL_MIN, autoCrawl: !NO_CRAWL });
      case "/sources": {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        return res.end(sourcesPage());
      }
      default:
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        return res.end("見つかりません");
    }
  } catch (e) {
    console.error(e);
    sendJson(res, 500, { error: (e as Error).message });
  }
});

server.on("error", (e: NodeJS.ErrnoException) => {
  if (e.code === "EADDRINUSE") {
    console.log(`地域密着レーダーはすでに起動しています（${URL_BASE}）。`);
    if (OPEN) openBrowser(URL_BASE);
    setTimeout(() => process.exit(0), 500);
    return;
  }
  throw e;
});

server.listen(PORT, "127.0.0.1", () => {
  const area = loadArea();
  console.log("────────────────────────────────────────");
  console.log(` 地域密着レーダー（PC版） ${URL_BASE}`);
  console.log(` 地域: ${area ? area.name : "まだ設定されていません"}`);
  console.log(NO_CRAWL ? " 自動巡回: しない" : ` 自動巡回: ${INTERVAL_MIN}分ごと（この窓を開いている間）`);
  console.log(" この窓を閉じるとレーダーは止まります。");
  console.log("────────────────────────────────────────");
  if (OPEN) openBrowser(URL_BASE);
  if (!NO_CRAWL) {
    const every = INTERVAL_MIN * 60 * 1000;
    const tick = () => {
      const last = lastCrawledAt();
      const due = !last || Date.now() - Date.parse(last) >= every;
      if (due && Date.now() - lastAttempt >= every) startCrawl(last ? "自動" : "初回");
    };
    setTimeout(tick, 3000);
    setInterval(tick, 60 * 1000);
  }
});
