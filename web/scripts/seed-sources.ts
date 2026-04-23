import { sb } from "./lib/supabase";

type SourceSeed = {
  name: string;
  url: string;
  rss_url: string;
  source_type: "号外NET" | "経済新聞" | "独立系ブログ" | "つうしん系" | "ku2shin系";
  pref: string;
  city: string | null;
};

const PILOT_SOURCES: SourceSeed[] = [
  {
    name: "号外NET 板橋区",
    url: "https://itabashi.goguynet.jp/",
    rss_url: "https://itabashi.goguynet.jp/category/cat_openclose/feed/",
    source_type: "号外NET",
    pref: "東京都",
    city: "板橋区",
  },
  {
    name: "号外NET 越谷市",
    url: "https://koshigaya.goguynet.jp/",
    rss_url: "https://koshigaya.goguynet.jp/category/cat_openclose/feed/",
    source_type: "号外NET",
    pref: "埼玉県",
    city: "越谷市",
  },
];

async function main() {
  for (const s of PILOT_SOURCES) {
    const { data, error } = await sb
      .from("sources")
      .upsert(s, { onConflict: "url" })
      .select();
    if (error) {
      console.error(`[${s.name}] ERROR:`, error.message);
    } else {
      console.log(`[${s.name}] upserted:`, data?.[0]?.id);
    }
  }
}

main().catch(console.error);
