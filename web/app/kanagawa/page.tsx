import RadarView from "@/components/RadarView";
import { fetchStores } from "@/lib/fetchStores";

export const revalidate = 60;

export default async function Page() {
  const stores = await fetchStores("神奈川県");
  return <RadarView stores={stores} pinnedPref="神奈川県" />;
}
