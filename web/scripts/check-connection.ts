import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const secret = process.env.SUPABASE_SECRET_KEY!;

const sb = createClient(url, secret, { auth: { persistSession: false } });

async function main() {
  console.log("URL:", url);

  for (const table of ["sources", "articles", "stores", "store_articles"]) {
    const { count, error } = await sb.from(table).select("*", { count: "exact", head: true });
    if (error) {
      console.error(`[${table}] ERROR:`, error.message);
    } else {
      console.log(`[${table}] rows: ${count ?? 0}`);
    }
  }
}

main().catch(console.error);
