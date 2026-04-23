import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;

if (!url || !secret) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SECRET_KEY");
}

export const sb = createClient(url, secret, {
  auth: { persistSession: false, autoRefreshToken: false },
});
