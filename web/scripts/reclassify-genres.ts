import { sb } from "./lib/supabase";
import { extractGenre } from "./lib/normalize";

async function main() {
  const { data: stores, error } = await sb
    .from("stores")
    .select("id, name, genre");
  if (error) throw error;

  let changed = 0;

  for (const store of stores ?? []) {
    const { data: sa } = await sb
      .from("store_articles")
      .select("article_id")
      .eq("store_id", store.id)
      .limit(1);
    const articleId = sa?.[0]?.article_id;
    if (!articleId) continue;
    const { data: article } = await sb
      .from("articles")
      .select("title, content")
      .eq("id", articleId)
      .single();
    if (!article) continue;
    const newGenre = extractGenre(article.content ?? "", article.title);
    if (newGenre && newGenre !== store.genre) {
      await sb.from("stores").update({ genre: newGenre }).eq("id", store.id);
      console.log(` ${store.name}: ${store.genre ?? "(null)"} → ${newGenre}`);
      changed++;
    }
  }
  console.log(`\n変更: ${changed} / ${stores?.length}`);
}

main().catch(console.error);
