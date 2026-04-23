import { sb } from "./supabase";

export type StoreCandidate = {
  name: string;
  name_normalized: string;
  addr: string | null;
  addr_normalized: string | null;
  tel_normalized: string | null;
  pref: string;
  city: string;
};

export type DedupeResult =
  | { type: "hard_match"; storeId: number }
  | { type: "soft_match"; storeId: number }
  | { type: "new" };

export async function findExistingStore(c: StoreCandidate): Promise<DedupeResult> {
  if (c.tel_normalized) {
    const { data } = await sb
      .from("stores")
      .select("id")
      .eq("tel_normalized", c.tel_normalized)
      .limit(1);
    if (data && data.length > 0) return { type: "hard_match", storeId: data[0].id };
  }

  {
    const { data } = await sb
      .from("stores")
      .select("id")
      .eq("name_normalized", c.name_normalized)
      .limit(1);
    if (data && data.length > 0) return { type: "hard_match", storeId: data[0].id };
  }

  if (c.addr_normalized) {
    const { data } = await sb
      .from("stores")
      .select("id, addr_normalized")
      .eq("name_normalized", c.name_normalized)
      .eq("addr_normalized", c.addr_normalized)
      .limit(1);
    if (data && data.length > 0) return { type: "hard_match", storeId: data[0].id };
  }

  const { data: similar } = await sb
    .from("stores")
    .select("id, name_normalized, city")
    .eq("pref", c.pref)
    .eq("city", c.city)
    .textSearch("name_normalized", c.name_normalized.slice(0, 4))
    .limit(5);

  if (similar && similar.length > 0) {
    return { type: "soft_match", storeId: similar[0].id };
  }

  return { type: "new" };
}
