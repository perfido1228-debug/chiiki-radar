import { sb } from "./lib/supabase";

async function main() {
  const { data, error } = await sb
    .from("articles")
    .select("id, title, content, article_url")
    .order("published_at", { ascending: false })
    .limit(3);
  if (error) { console.error(error); return; }
  for (const a of data ?? []) {
    console.log(`\n=== #${a.id} ===`);
    console.log(`TITLE: ${a.title}`);
    console.log(`URL:   ${a.article_url}`);
    console.log(`CONTENT LEN: ${(a.content ?? "").length}`);
    console.log(`CONTENT: ${(a.content ?? "").slice(0, 400)}...`);
  }
}

main().catch(console.error);
