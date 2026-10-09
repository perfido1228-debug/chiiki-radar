// 2年より前の店・記事を削除する（Supabase 無料枠の容量を保つため。GitHub Actions から毎日実行）。
//   npx tsx scripts/purge.ts            … 削除する
//   npx tsx scripts/purge.ts --dry-run  … 件数だけ表示する
// 以前はワークフローの1行スクリプトで呼んでいたが、モジュールの読み込み方の誤りで一度も動いていなかった。
// また「重複の可能性あり」の参照先（duplicate_of_id）になっている店を消すと外部キー違反で止まるため、先に参照を外す。
import { sb } from "./lib/supabase";

const DRY_RUN = process.argv.includes("--dry-run");
const KEEP_DAYS = 730;

async function idsWhere(table: "stores" | "articles", column: string, before: string): Promise<number[]> {
  const ids: number[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select("id").lt(column, before).order("id").range(from, from + 999);
    if (error) throw new Error(`${table} の検索に失敗: ${error.message}`);
    ids.push(...(data ?? []).map((r) => r.id as number));
    if (!data || data.length < 1000) break;
  }
  return ids;
}

async function main() {
  const cutoff = new Date(Date.now() - KEEP_DAYS * 86400000);
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  const storeIds = await idsWhere("stores", "listed_date", cutoffDate);
  const articleIds = await idsWhere("articles", "published_at", cutoff.toISOString());
  console.log(`${cutoffDate} より前: 店 ${storeIds.length} 件 / 記事 ${articleIds.length} 件${DRY_RUN ? "（試行のため削除しません）" : ""}`);
  if (DRY_RUN) return;

  for (let i = 0; i < storeIds.length; i += 200) {
    const chunk = storeIds.slice(i, i + 200);
    const { error: refErr } = await sb.from("stores").update({ duplicate_of_id: null }).in("duplicate_of_id", chunk);
    if (refErr) throw new Error(`重複参照の解除に失敗: ${refErr.message}`);
    const { error } = await sb.from("stores").delete().in("id", chunk);
    if (error) throw new Error(`店の削除に失敗: ${error.message}`);
  }
  for (let i = 0; i < articleIds.length; i += 200) {
    const { error } = await sb.from("articles").delete().in("id", articleIds.slice(i, i + 200));
    if (error) throw new Error(`記事の削除に失敗: ${error.message}`);
  }
  console.log("削除しました。");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
