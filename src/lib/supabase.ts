export type ItemRow = {
  id: string;
  group_id: string;
  name: string;
  category: string;
  status: string;
  expiration_date: string | null;
  is_shopping_list: boolean;
  created_at: string;
  updated_at: string;
};

export { isSupabaseConfigured } from "@/utils/supabase/config";
