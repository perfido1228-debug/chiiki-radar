import { createClient } from "@supabase/supabase-js";
import type { Store } from "./types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

type Row = {
  id: number;
  name: string;
  addr: string | null;
  pref: string;
  city: string;
  tel: string | null;
  genre: string | null;
  open_date: string | null;
  listed_date: string;
  thumbnail_url: string | null;
  duplicate_flag: boolean;
  duplicate_of_id: number | null;
  article_title: string | null;
  sources: Array<{ name: string; url: string; type: string; title?: string }>;
};

export async function fetchStores(pref?: string): Promise<Store[]> {
  const sb = createClient(url, key, { auth: { persistSession: false } });
  let q = sb.from("v_stores_with_sources").select("*").order("listed_date", { ascending: false });
  if (pref) q = q.eq("pref", pref);
  const { data, error } = await q;
  if (error) {
    console.error("fetchStores error:", error);
    return [];
  }
  return (data as Row[]).map((r) => ({
    id: String(r.id),
    name: r.name,
    articleTitle: r.article_title ?? undefined,
    addr: r.addr ?? "",
    pref: r.pref as Store["pref"],
    city: r.city,
    date: r.listed_date,
    openDate: r.open_date ?? "",
    genre: r.genre ?? "その他",
    tel: r.tel ?? "",
    thumb: r.thumbnail_url ?? "",
    sources: (r.sources ?? []).map((s) => ({
      name: s.name,
      url: s.url,
      type: s.type as Store["sources"][0]["type"],
    })),
    duplicateFlag: r.duplicate_flag,
    duplicateOfId: r.duplicate_of_id ? String(r.duplicate_of_id) : undefined,
  }));
}
