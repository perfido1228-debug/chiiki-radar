import RadarView from "@/components/RadarView";
import { fetchStores } from "@/lib/fetchStores";

export const revalidate = 60;

export default async function Page() {
  const stores = await fetchStores();
  return <RadarView stores={stores} />;
}
