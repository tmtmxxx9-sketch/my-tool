import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Supabase の環境変数が未設定です。.env.local に NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY（または ANON_KEY）を設定してください。",
  );
}

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
