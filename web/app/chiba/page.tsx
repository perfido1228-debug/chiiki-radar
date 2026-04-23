import RadarView from "@/components/RadarView";
import { fetchStores } from "@/lib/fetchStores";

export const revalidate = 30;

export default async function Page() {
  const stores = await fetchStores("千葉県");
  return <RadarView stores={stores} pinnedPref="千葉県" />;
}
