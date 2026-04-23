import RadarView from "@/components/RadarView";
import { fetchStores } from "@/lib/fetchStores";

export const revalidate = 30;

export default async function Page() {
  const stores = await fetchStores();
  return <RadarView stores={stores} />;
}
