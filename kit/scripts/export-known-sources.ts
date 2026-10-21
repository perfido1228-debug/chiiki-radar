// 本番（地域密着レーダー）で使っている情報源の一覧を、キット用に書き出す（masters/known-sources.json）。
// 公開サイトのURLだけで、鍵などは含めない。キットの tools/find-sources が「確認済みの情報源」として候補に出す。
// 使い方（web フォルダで）: npx tsx ../kit/scripts/export-known-sources.ts
import { writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { sb } from "../../web/scripts/lib/supabase";

const here = dirname(fileURLToPath(import.meta.url));

async function main() {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("sources").select("name, url, rss_url, source_type, pref, city, enabled").order("id").range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const out = {
    source: "地域密着レーダー（本番）の情報源一覧。enabled=false は止めている情報源",
    generatedAt: new Date().toISOString().slice(0, 10),
    sources: rows,
  };
  const file = join(here, "..", "masters", "known-sources.json");
  writeFileSync(file, JSON.stringify(out, null, 1));
  console.log(`${file}: ${rows.length} 件`);
}
main().finally(() => process.exit());
