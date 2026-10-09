// 2026-10 データ修復（1回限り）。
//   npx tsx scripts/repair-2026-10.ts --plan=<保存先.json>             … 何をどう直すかを試算して保存（DBは変更しない）
//   npx tsx scripts/repair-2026-10.ts --apply=<保存先.json> [--only=分類,…] … 保存した試算どおりに直す
//
// 直す内容（分類名）:
//   split   … 誤って1件にまとめられていた記事を切り離し、正しい店（既存 or 新規）に付け直す
//             （電話番号の読み違い・別の市区町村の同名店）
//   orphan  … 記事はあるのに店が作られていなかった記事から店を作る／既存の店に付ける
//   tel     … 電話番号として成り立たない番号を消す（読み直せれば正しい番号に）
//   addr    … 住所の誤読（文章・注記の混入）を直す。住所から割り出した市区町村・都府県も合わせて直す
//   city    … 政令市の区・「東村山市」等の市区町村名を正しくする
//   date    … 掲載日を日本時間に直す
//   open    … 空欄のオープン日を記事から読み直して埋める
//   genre   … 空欄のジャンルを記事から読み直して埋める
//   station … 「最寄り駅」など駅名でない値を直す／空欄を埋める
//   name    … 見出しがそのまま入っている店名を読み直す
import { readFileSync, writeFileSync } from "fs";
import { sb } from "./lib/supabase";
import { analyzeArticle, type Analysis, type StoreDraft } from "./lib/extract";
import { decideMatch, sameMunicipality, municipalityBase, type StoreLite } from "./lib/dedupe";
import {
  extractAddress,
  extractCity,
  extractNearestStation,
  extractPref,
  classifyArticle,
  isKnownCity,
  looksLikeStoreName,
  nameLooksNonFood,
  isValidJpPhone,
  jstDateString,
  namesCompatible,
  normalizeAddress,
  normalizeStoreName,
} from "./lib/normalize";

type SourceRow = { id: number; name: string; pref: string | null; city: string | null; source_type: string };
type StoreRow = {
  id: number; name: string; name_normalized: string; addr: string | null; addr_normalized: string | null;
  pref: string; city: string; tel: string | null; tel_normalized: string | null; genre: string | null;
  open_date: string | null; listed_date: string; nearest_station: string | null;
  duplicate_flag: boolean; duplicate_of_id: number | null; created_at: string;
};
type ArticleRow = { id: number; source_id: number; title: string; content: string | null; published_at: string; thumbnail_url: string | null };
type LinkRow = { store_id: number; article_id: number };

type Plan = {
  createdAt: string;
  detach: Array<{ storeId: number; articleId: number; reason: string }>;
  newStores: Array<{ key: string; draft: StoreDraft; thumbnail: string | null; softOf: number | string | null; articleIds: number[]; from: "split" | "orphan" }>;
  attach: Array<{ articleId: number; storeId: number; from: "split" | "orphan" }>;
  updates: Array<{ id: number; categories: string[]; before: Record<string, unknown>; after: Record<string, unknown> }>;
  report: Record<string, unknown>;
};

const args = process.argv.slice(2);
const planPath = args.find((a) => a.startsWith("--plan="))?.slice(7);
const applyPath = args.find((a) => a.startsWith("--apply="))?.slice(8);
const only = args.find((a) => a.startsWith("--only="))?.slice(7).split(",");

async function fetchAll<T>(table: string, select: string, order = "id"): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select(select).order(order).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

const GARBAGE_STATIONS = /^(?:最寄り?駅|場所は|.*(?:には|では|合わせて|あわせて|左手|右手))/;

async function makePlan(path: string) {
  console.log("データを読み込みます…");
  const sources = await fetchAll<SourceRow>("sources", "id, name, pref, city, source_type");
  const stores = await fetchAll<StoreRow>("stores", "*");
  const links = await fetchAll<LinkRow>("store_articles", "store_id, article_id", "store_id");
  const articles = await fetchAll<ArticleRow>("articles", "id, source_id, title, content, published_at, thumbnail_url");
  console.log(`店 ${stores.length} / 記事 ${articles.length} / 紐づけ ${links.length}`);

  const srcById = new Map(sources.map((s) => [s.id, s]));
  const artById = new Map(articles.map((a) => [a.id, a]));
  const storeById = new Map(stores.map((s) => [s.id, s]));
  const analysis = new Map<number, Analysis>();
  for (const a of articles) {
    const src = srcById.get(a.source_id);
    if (!src) continue;
    analysis.set(a.id, analyzeArticle({ title: a.title, rssText: a.content ?? "", publishedAt: new Date(a.published_at), source: src }, { skipClassify: true }));
  }
  const draftOf = (articleId: number): StoreDraft | null => {
    const r = analysis.get(articleId);
    return r && r.ok ? r.draft : null;
  };

  const storeArticles = new Map<number, number[]>();
  const linkedArticles = new Set<number>();
  for (const l of links) {
    if (!artById.has(l.article_id)) continue;
    (storeArticles.get(l.store_id) ?? storeArticles.set(l.store_id, []).get(l.store_id)!).push(l.article_id);
    linkedArticles.add(l.article_id);
  }
  const byDate = (x: number, y: number) => (artById.get(x)!.published_at).localeCompare(artById.get(y)!.published_at) || x - y;

  const plan: Plan = { createdAt: new Date().toISOString(), detach: [], newStores: [], attach: [], updates: [], report: {} };

  // ---- 1) 誤ってまとめられた記事を切り離す
  // 店の「最初の記事」を基準に、店名が同じ店と言えない／別の市区町村の記事は切り離す
  const detachedIds: number[] = [];
  const telMergeCount = { tel: 0, area: 0 };
  for (const [storeId, artIds] of storeArticles) {
    if (artIds.length < 2) continue;
    const st = storeById.get(storeId)!;
    const sorted = [...artIds].sort(byDate);
    const core = draftOf(sorted[0]);
    const coreName = core?.name ?? st.name;
    const corePref = core?.pref ?? st.pref;
    const coreCity = core?.city ?? st.city;
    for (const aid of sorted.slice(1)) {
      const d = draftOf(aid);
      if (!d) continue; // 読み取れない記事は今のまま
      const nameOk = namesCompatible(d.name, coreName) || namesCompatible(d.name, st.name);
      const placeOk = sameMunicipality(d.pref, d.city, corePref, coreCity) || sameMunicipality(d.pref, d.city, st.pref, st.city);
      if (nameOk && placeOk) continue;
      const reason = !nameOk ? "店名が違う（電話番号の読み違いで統合）" : "別の市区町村の同名店";
      if (!nameOk) telMergeCount.tel++;
      else telMergeCount.area++;
      plan.detach.push({ storeId, articleId: aid, reason });
      detachedIds.push(aid);
    }
  }

  // ---- 2) 切り離した記事と、店のない記事を、正しい店に付ける（なければ店を作る）
  type Cluster = StoreLite & { tel: string | null; nn: string };
  const clusters: Cluster[] = stores.map((s) => ({ id: s.id, name: s.name, pref: s.pref, city: s.city, tel: s.tel_normalized, nn: s.name_normalized }));
  const newByKey = new Map<string, Plan["newStores"][number]>();
  let seq = 0;
  const nonFoodDropped: string[] = [];
  const place = (aid: number, from: "split" | "orphan") => {
    const d = draftOf(aid);
    if (!d) return false;
    // 今の判定で飲食の開店記事でないもの（福祉施設・家具店など）は店にしない
    const art = artById.get(aid)!;
    if (!classifyArticle(art.title, art.content ?? "").ok || nameLooksNonFood(d.name)) {
      nonFoodDropped.push(art.title);
      return false;
    }
    const telMatches = d.tel_normalized ? clusters.filter((c) => c.tel === d.tel_normalized) : [];
    const base = municipalityBase(d.city);
    const local = clusters.filter((c) => c.pref === d.pref && (c.city === d.city || c.city.startsWith(base)));
    const sameName = clusters.filter((c) => c.pref === d.pref && c.nn === d.name_normalized);
    const m = decideMatch(d, telMatches as StoreLite[], local as StoreLite[], sameName as StoreLite[]);
    if (m.type === "hard_match") {
      const target = m.storeId as unknown as number | string;
      if (typeof target === "string" || String(target).startsWith("new:")) newByKey.get(String(target))!.articleIds.push(aid);
      else plan.attach.push({ articleId: aid, storeId: target, from });
      return true;
    }
    const key = `new:${++seq}`;
    const ns = { key, draft: d, thumbnail: art.thumbnail_url, softOf: m.type === "soft_match" ? (m.storeId as number | string) : null, articleIds: [aid], from };
    newByKey.set(key, ns);
    plan.newStores.push(ns);
    clusters.push({ id: key as unknown as number, name: d.name, pref: d.pref, city: d.city, tel: d.tel_normalized, nn: d.name_normalized });
    return true;
  };
  for (const aid of [...detachedIds].sort(byDate)) place(aid, "split");
  const orphanIds = articles.filter((a) => !linkedArticles.has(a.id)).map((a) => a.id).sort(byDate);
  const orphanFail: Record<string, number> = {};
  for (const aid of orphanIds) {
    if (!place(aid, "orphan")) {
      const r = analysis.get(aid);
      const reason = r && !r.ok ? r.reason : "不明";
      orphanFail[reason] = (orphanFail[reason] ?? 0) + 1;
    }
  }

  // ---- 3) 既存の店の値の誤りを直す
  const detachedSet = new Set(plan.detach.map((x) => `${x.storeId}:${x.articleId}`));
  for (const st of stores) {
    const artIds = (storeArticles.get(st.id) ?? []).filter((aid) => !detachedSet.has(`${st.id}:${aid}`)).sort(byDate);
    if (!artIds.length) continue;
    const drafts = artIds.map(draftOf).filter((d): d is StoreDraft => !!d);
    const core = draftOf(artIds[0]);
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    const cats = new Set<string>();
    const set = (field: keyof StoreRow, value: unknown, cat: string) => {
      if ((st[field] ?? null) === (value ?? null)) return;
      before[field] = st[field];
      after[field] = value;
      cats.add(cat);
    };

    // 電話番号
    if (st.tel_normalized && !isValidJpPhone(st.tel_normalized)) {
      const t = drafts.find((d) => d.tel_normalized)?.tel_normalized ?? null;
      set("tel", t, "tel");
      set("tel_normalized", t, "tel");
    }

    // 住所（誤読なら記事から読み直す）→ 市区町村・都府県
    let addr = st.addr;
    if (addr) {
      const clean = extractAddress(addr);
      if (!clean) addr = drafts.find((d) => d.addr)?.addr ?? null;
      else if (clean !== addr) addr = clean;
    }
    if (addr !== st.addr) {
      set("addr", addr, "addr");
      set("addr_normalized", addr ? normalizeAddress(addr) : null, "addr");
    }
    let pref: string = st.pref;
    let city: string = st.city;
    if (addr) {
      // 住所があれば住所から割り出す
      const p = extractPref(addr);
      const c = p ? extractCity(addr, p, st.city) : null;
      if (p && c) {
        pref = p;
        city = c;
      }
    } else if (core) {
      // 住所がない店は、市区町村名が実在しない（「東村」等）か、記事からより詳しく分かる（「大阪市」→「大阪市北区」）場合に直す
      const more = core.pref === st.pref && core.city !== st.city && core.city.startsWith(st.city);
      if (!isKnownCity(st.pref, st.city) || more) {
        pref = core.pref;
        city = core.city;
      }
    }
    if (pref !== st.pref && (PREFS_SET.has(pref))) set("pref", pref, addr !== st.addr ? "addr" : "city");
    if (city !== st.city) set("city", city, addr !== st.addr ? "addr" : "city");

    // 掲載日（日本時間・最初の記事）
    const listed = jstDateString(new Date(artById.get(artIds[0])!.published_at));
    if (listed !== st.listed_date) set("listed_date", listed, "date");

    // オープン日・ジャンル・最寄駅の空欄を埋める（オープン日は新しい記事の情報を優先）
    if (!st.open_date) {
      const od = [...drafts].reverse().find((d) => d.open_date)?.open_date ?? null;
      if (od) set("open_date", od, "open");
    }
    if (!st.genre) {
      const g = drafts.find((d) => d.genre)?.genre ?? null;
      if (g) set("genre", g, "genre");
    }
    if (st.nearest_station && (GARBAGE_STATIONS.test(st.nearest_station) || !extractNearestStation(st.nearest_station))) {
      set("nearest_station", drafts.find((d) => d.nearest_station)?.nearest_station ?? null, "station");
    } else if (!st.nearest_station) {
      const s = drafts.find((d) => d.nearest_station)?.nearest_station ?? null;
      if (s) set("nearest_station", s, "station");
    }

    // 店名（見出しがそのまま入っているもの）
    const title = artById.get(artIds[0])!.title.trim();
    const looksLikeTitle = st.name.length > 28 || /(?:オープン|OPEN|開店|開業|しました|します|みたい|予定|判明|！|!|。)/.test(st.name) || st.name === title;
    if (core && looksLikeTitle && core.name !== st.name && core.name.length < st.name.length && title.includes(core.name) && looksLikeStoreName(core.name)) {
      set("name", core.name, "name");
      set("name_normalized", normalizeStoreName(core.name), "name");
    }

    if (cats.size) plan.updates.push({ id: st.id, categories: [...cats], before, after });
  }

  // ---- 集計
  const catCount: Record<string, number> = {};
  for (const u of plan.updates) for (const c of u.categories) catCount[c] = (catCount[c] ?? 0) + 1;
  const outOfArea = articles.filter((a) => {
    const r = analysis.get(a.id);
    return r && !r.ok && r.reason === "対象エリア外" && linkedArticles.has(a.id);
  });
  const outOfAreaStores = new Set<number>();
  for (const l of links) if (outOfArea.some((a) => a.id === l.article_id)) outOfAreaStores.add(l.store_id);
  plan.report = {
    stores: stores.length,
    articles: articles.length,
    detach: { total: plan.detach.length, ...telMergeCount },
    newStores: { total: plan.newStores.length, fromSplit: plan.newStores.filter((n) => n.from === "split").length, fromOrphan: plan.newStores.filter((n) => n.from === "orphan").length },
    attachToExisting: { total: plan.attach.length, fromSplit: plan.attach.filter((a) => a.from === "split").length, fromOrphan: plan.attach.filter((a) => a.from === "orphan").length },
    orphans: { total: orphanIds.length, notPlaced: orphanFail },
    droppedAsNonFood: nonFoodDropped.length,
    updates: { stores: plan.updates.length, byCategory: catCount },
    outOfAreaStores: outOfAreaStores.size,
  };
  writeFileSync(path, JSON.stringify(plan, null, 1));
  console.log(JSON.stringify(plan.report, null, 2));
  console.log(`試算を保存しました: ${path}`);
}

const PREFS_SET = new Set<string>(["東京都", "神奈川県", "千葉県", "埼玉県", "愛知県", "大阪府", "京都府"]);

async function applyPlan(path: string) {
  const plan = JSON.parse(readFileSync(path, "utf-8")) as Plan;
  const want = (cat: string) => !only || only.includes(cat);
  console.log(`試算（${plan.createdAt}）を適用します。対象: ${only ? only.join(",") : "すべて"}`);

  // 1) 切り離しと付け直し
  if (want("split") || want("orphan")) {
    const newIdByKey = new Map<string, number>();
    for (const ns of plan.newStores) {
      if (!want(ns.from)) continue;
      const softOf = typeof ns.softOf === "string" ? newIdByKey.get(ns.softOf) ?? null : ns.softOf;
      const { data, error } = await sb
        .from("stores")
        .insert({ ...ns.draft, thumbnail_url: ns.thumbnail, duplicate_flag: ns.softOf !== null, duplicate_of_id: softOf })
        .select("id")
        .single();
      if (error || !data) throw new Error(`店の登録に失敗: ${error?.message}`);
      newIdByKey.set(ns.key, data.id);
    }
    for (const d of plan.detach) {
      if (!want("split")) break;
      const { error } = await sb.from("store_articles").delete().eq("store_id", d.storeId).eq("article_id", d.articleId);
      if (error) throw new Error(`切り離しに失敗: ${error.message}`);
    }
    for (const ns of plan.newStores) {
      const id = newIdByKey.get(ns.key);
      if (!id) continue;
      const { error } = await sb.from("store_articles").upsert(ns.articleIds.map((aid) => ({ store_id: id, article_id: aid })));
      if (error) throw new Error(`付け直しに失敗: ${error.message}`);
    }
    const attach = plan.attach.filter((a) => want(a.from));
    for (let i = 0; i < attach.length; i += 200) {
      const { error } = await sb.from("store_articles").upsert(attach.slice(i, i + 200).map((a) => ({ store_id: a.storeId, article_id: a.articleId })));
      if (error) throw new Error(`付け直しに失敗: ${error.message}`);
    }
    console.log(`新しい店 ${newIdByKey.size} 件・付け直し ${attach.length} 件・切り離し ${want("split") ? plan.detach.length : 0} 件`);
  }

  // 2) 値の修正
  let n = 0;
  for (const u of plan.updates) {
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(u.after)) {
      const cat = u.categories.find((c) => want(c));
      if (cat) patch[k] = v;
    }
    // 分類ごとに選べるよう、対象外の分類の項目は外す
    if (only) {
      const allowed = new Set<string>();
      const fieldCats: Record<string, string[]> = {
        tel: ["tel", "tel_normalized"], addr: ["addr", "addr_normalized", "pref", "city"], city: ["pref", "city"],
        date: ["listed_date"], open: ["open_date"], genre: ["genre"], station: ["nearest_station"], name: ["name", "name_normalized"],
      };
      for (const c of u.categories) if (want(c)) (fieldCats[c] ?? []).forEach((f) => allowed.add(f));
      for (const k of Object.keys(patch)) if (!allowed.has(k)) delete patch[k];
    }
    if (!Object.keys(patch).length) continue;
    const { error } = await sb.from("stores").update(patch).eq("id", u.id);
    if (error) throw new Error(`店 ${u.id} の修正に失敗: ${error.message}`);
    n++;
  }
  console.log(`値を直した店 ${n} 件`);
}

async function main() {
  if (planPath) await makePlan(planPath);
  else if (applyPath) await applyPlan(applyPath);
  else console.log("--plan=<file> または --apply=<file> を指定してください");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
