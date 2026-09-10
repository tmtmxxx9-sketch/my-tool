/** DB 未設定時のビルド通過用プレースホルダ（本番接続には使わない） */
export const PLACEHOLDER_SUPABASE_URL = "https://placeholder.supabase.co";
export const PLACEHOLDER_SUPABASE_KEY = "placeholder-anon-key";

export function getSupabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || PLACEHOLDER_SUPABASE_URL;
}

export function getSupabaseAnonKey(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ??
    PLACEHOLDER_SUPABASE_KEY
  );
}

export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  return Boolean(url && key);
}
