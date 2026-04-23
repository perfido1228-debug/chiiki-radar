import { sb } from "./lib/supabase";

async function main() {
  const patterns = "name.ilike.%マンション%,name.ilike.%不審者%,name.ilike.%ランキング%,name.ilike.%防犯%,name.ilike.%事件%,name.ilike.%物件%,name.ilike.%分譲%,name.ilike.%賃貸%,name.ilike.%事故%,name.ilike.%クイズ%,name.ilike.%ランクイン%";
  const { data: bad, error } = await sb.from("stores").select("id, name").or(patterns);
  if (error) { console.error(error); return; }
  console.log("found:", bad?.length);
  if (!bad || bad.length === 0) return;
  bad.forEach((b) => console.log(" -", b.name));
  const ids = bad.map((b) => b.id);
  const { error: e1 } = await sb.from("store_articles").delete().in("store_id", ids);
  if (e1) console.error("store_articles:", e1);
  const { error: e2 } = await sb.from("stores").delete().in("id", ids);
  if (e2) console.error("stores:", e2);
  console.log("deleted:", bad.length);
}

main().catch(console.error);
