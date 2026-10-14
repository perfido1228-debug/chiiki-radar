import RadarView from "@/components/RadarView";
import { fetchRadarData } from "@/lib/fetchStores";

// 画面は1時間ごとに作り直す（30秒ごとだと Vercel の「ISRの書き込み」上限を超えて全アプリが止まった 2026-10-14）
export const revalidate = 3600;

export default async function Page() {
  const { data, meta } = await fetchRadarData("埼玉県");
  return <RadarView data={data} meta={meta} pinnedPref="埼玉県" />;
}
