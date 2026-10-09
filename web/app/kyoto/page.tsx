import RadarView from "@/components/RadarView";
import { fetchRadarData } from "@/lib/fetchStores";

export const revalidate = 30;

export default async function Page() {
  const { data, meta } = await fetchRadarData("京都府");
  return <RadarView data={data} meta={meta} pinnedPref="京都府" />;
}
