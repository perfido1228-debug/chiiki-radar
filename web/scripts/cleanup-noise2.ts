import { sb } from "./lib/supabase";

async function main() {
  const pat = [
    "name.ilike.%補助金%",
    "name.ilike.%助成金%",
    "name.ilike.%給付金%",
    "name.ilike.%不審者%",
    "name.ilike.%防犯%",
    "name.ilike.%講座%",
    "name.ilike.%セミナー%",
    "name.ilike.%ワークショップ%",
    "name.ilike.%受付終了%",
    "name.ilike.%募集中%",
    "name.ilike.%応募%",
    "name.ilike.%お知らせ%",
    "name.ilike.%マネープラン%",
    "name.ilike.%マネ-プラン%",
    "name.ilike.%省エネ%",
    "name.ilike.%補助%",
    "name.ilike.%マンション%",
    "name.ilike.%ランキング%",
    "name.ilike.%クイズ%",
    "name.ilike.%事件%",
    "name.ilike.%事故%",
    "name.ilike.%物件%",
    "name.ilike.%分譲%",
    "name.ilike.%賃貸%",
    "name.ilike.%閉店%",
    "name.ilike.%閉業%",
    "name.ilike.%改装%",
    "name.ilike.%リニューアル%",
    "name.ilike.%移転%",
    "name.ilike.%イベント%",
    "name.ilike.%祭り%",
    "name.ilike.%まつり%",
    "name.ilike.%キャンペーン%",
    "name.ilike.%中止%",
    "name.ilike.%記事タイトル%",
    "name.ilike.%について%",
    "name.ilike.%終了%",
    "name.ilike.%締切%",
    "name.ilike.%工事%",
    "name.ilike.%議会%",
  ].join(",");
  const { data: bad, error } = await sb.from("stores").select("id, name").or(pat);
  if (error) { console.error(error); return; }
  console.log("found:", bad?.length);
  if (!bad || bad.length === 0) return;
  bad.forEach((b) => console.log(" -", b.name));
  const ids = bad.map((b) => b.id);
  await sb.from("store_articles").delete().in("store_id", ids);
  const { error: e2 } = await sb.from("stores").delete().in("id", ids);
  console.log("deleted:", e2 ? e2.message : bad.length);
}

main().catch(console.error);
