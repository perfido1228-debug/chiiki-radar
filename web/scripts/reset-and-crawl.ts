import { sb } from "./lib/supabase";

async function main() {
  console.log("Truncating stores/articles/store_articles...");
  await sb.from("store_articles").delete().gt("store_id", 0);
  await sb.from("stores").delete().gt("id", 0);
  await sb.from("articles").delete().gt("id", 0);
  console.log("Done. Re-run `npx tsx scripts/crawl.ts` to repopulate.");
}

main().catch(console.error);
