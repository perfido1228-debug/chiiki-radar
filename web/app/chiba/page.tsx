import RadarView from "@/components/RadarView";
import { fetchRadarData } from "@/lib/fetchStores";

export const revalidate = 30;

export default async function Page() {
  const { data, meta } = await fetchRadarData("千葉県");
  return <RadarView data={data} meta={meta} pinnedPref="千葉県" />;
}
