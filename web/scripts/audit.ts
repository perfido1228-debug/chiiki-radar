import { sb } from "./lib/supabase";

async function main() {
  const { count: sc } = await sb.from("stores").select("*", { count: "exact", head: true });
  const { count: ac } = await sb.from("articles").select("*", { count: "exact", head: true });
  const { data: byPref } = await sb.from("stores").select("pref");
  const prefCounts: Record<string, number> = {};
  (byPref ?? []).forEach((r: any) => (prefCounts[r.pref] = (prefCounts[r.pref] ?? 0) + 1));
  const { count: addrOk } = await sb.from("stores").select("*", { count: "exact", head: true }).not("addr", "is", null);
  const { count: stnOk } = await sb.from("stores").select("*", { count: "exact", head: true }).not("nearest_station", "is", null);
  const { count: telOk } = await sb.from("stores").select("*", { count: "exact", head: true }).not("tel", "is", null);
  const sus = "name.ilike.%マンション%,name.ilike.%不審者%,name.ilike.%ランキング%,name.ilike.%防犯%,name.ilike.%事件%,name.ilike.%物件%,name.ilike.%分譲%,name.ilike.%賃貸%,name.ilike.%事故%,name.ilike.%クイズ%,name.ilike.%補助金%,name.ilike.%セミナー%,name.ilike.%イベント%,name.ilike.%キャンペーン%,name.ilike.%ランクイン%";
  const { data: suspicious } = await sb.from("stores").select("name").or(sus);

  console.log("=== 最終データ品質 ===");
  console.log("articles:", ac, "stores:", sc);
  console.log("byPref:", prefCounts);
  const scN = sc ?? 1;
  console.log(`住所あり: ${addrOk}/${sc} (${Math.round((addrOk ?? 0) * 100 / scN)}%)`);
  console.log(`最寄駅あり: ${stnOk}/${sc} (${Math.round((stnOk ?? 0) * 100 / scN)}%)`);
  console.log(`電話あり: ${telOk}/${sc} (${Math.round((telOk ?? 0) * 100 / scN)}%)`);
  console.log(`疑わしい名前: ${suspicious?.length ?? 0}`);
  suspicious?.slice(0, 10).forEach((s: any) => console.log(" -", s.name));
}

main().catch(console.error);
