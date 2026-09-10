import { createClient } from "@supabase/supabase-js";

/** DB 未設定時のビルド通過用プレースホルダ（本番接続には使わない） */
const PLACEHOLDER_SUPABASE_URL = "https://placeholder.supabase.co";
const PLACEHOLDER_SUPABASE_KEY = "placeholder-anon-key";

const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const configuredKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

export const isSupabaseConfigured = Boolean(configuredUrl && configuredKey);

const supabaseUrl = configuredUrl || PLACEHOLDER_SUPABASE_URL;
const supabaseKey = configuredKey || PLACEHOLDER_SUPABASE_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);

export type ItemRow = {
  id: string;
  name: string;
  category: string;
  status: string;
  expiration_date: string | null;
  is_shopping_list: boolean;
  created_at: string;
  updated_at: string;
};
