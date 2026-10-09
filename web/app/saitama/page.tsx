import RadarView from "@/components/RadarView";
import { fetchRadarData } from "@/lib/fetchStores";

export const revalidate = 30;

export default async function Page() {
  const { data, meta } = await fetchRadarData("埼玉県");
  return <RadarView data={data} meta={meta} pinnedPref="埼玉県" />;
}
