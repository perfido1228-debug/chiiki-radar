import { sb } from "./lib/supabase";

async function main() {
  const city = process.argv[2] ?? "越谷市";
  const { data, count } = await sb
    .from("stores")
    .select("id, name, genre, created_at", { count: "exact" })
    .eq("city", city)
    .order("created_at", { ascending: false })
    .limit(50);
  console.log(`${city} の店舗数: ${count}`);
  data?.forEach((d: any) => console.log(` -`, d.genre ?? "(null)", "|", d.name));
}

main().catch(console.error);
