import RadarView from "@/components/RadarView";
import { fetchStores } from "@/lib/fetchStores";

export const revalidate = 30;

export default async function Page() {
  const stores = await fetchStores("埼玉県");
  return <RadarView stores={stores} pinnedPref="埼玉県" />;
}
