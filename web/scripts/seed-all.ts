import { sb } from "./lib/supabase";
import { ALL_SOURCES } from "./lib/sources-data";

async function main() {
  console.log(`Seeding ${ALL_SOURCES.length} sources...`);
  let ok = 0, fail = 0;
  for (const s of ALL_SOURCES) {
    const { error } = await sb
      .from("sources")
      .upsert(s, { onConflict: "url" });
    if (error) {
      console.error(`[${s.name}] ${error.message}`);
      fail++;
    } else {
      ok++;
    }
  }
  console.log(`Done. ok=${ok} fail=${fail}`);
}

main().catch(console.error);
