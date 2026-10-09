import type { NextRequest } from "next/server";
import { fetchStoreRange, jstDaysAgo, WINDOW_DAYS } from "@/lib/fetchStores";
import { pack } from "@/lib/compact";

const PREFS = ["東京都", "神奈川県", "千葉県", "埼玉県", "愛知県", "大阪府", "京都府"];

// 最初の表示期間より前の店を1000件ずつ返す（画面の「さらに古い店も読み込む」用）
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const pref = sp.get("pref") ?? undefined;
  if (pref && !PREFS.includes(pref)) return Response.json({ error: "pref が不正です" }, { status: 400 });
  const offset = Math.max(0, Number(sp.get("offset") ?? 0) || 0);
  try {
    const stores = await fetchStoreRange({ pref, before: jstDaysAgo(WINDOW_DAYS), offset, limit: 1000 });
    return Response.json({ data: pack(stores), nextOffset: stores.length === 1000 ? offset + 1000 : null });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
