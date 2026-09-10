import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import {
  formatSupabaseError,
  resolveUserGroupId,
} from "@/lib/group-membership";
import { rowToInventoryItemFromRow } from "@/lib/inventory-shared";
import type { ItemCategory, StockStatus } from "@/lib/inventory";
import { isSupabaseConfigured } from "@/utils/supabase/config";

type BulkInsertItem = {
  name?: string;
  category?: ItemCategory;
  status?: StockStatus;
  expiryDate?: string;
};

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase の環境変数が未設定です。" },
      { status: 503 },
    );
  }

  let body: { items?: BulkInsertItem[] };
  try {
    body = (await request.json()) as { items?: BulkInsertItem[] };
  } catch {
    return NextResponse.json(
      { error: "リクエスト形式が正しくありません。" },
      { status: 400 },
    );
  }

  const rawItems = Array.isArray(body.items) ? body.items : [];
  const items = rawItems
    .map((item) => ({
      name: item.name?.trim() ?? "",
      category: item.category ?? "食材",
      status: item.status ?? "あり",
      expiryDate: item.expiryDate?.trim() || undefined,
    }))
    .filter((item) => item.name.length > 0);

  if (items.length === 0) {
    return NextResponse.json(
      { error: "登録する商品を選んでください。" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      {
        error: "ログインが必要です。",
        details: authError?.message,
      },
      { status: 401 },
    );
  }

  let groupId: string;
  try {
    groupId = await resolveUserGroupId(supabase, user.id);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "所属グループの取得に失敗しました。";
    console.error("[inventory/bulk] group resolve failed:", error);
    return NextResponse.json(
      {
        error: message,
        details: user.id,
      },
      { status: 403 },
    );
  }

  const { data, error } = await supabase
    .from("items")
    .insert(
      items.map((item) => ({
        group_id: groupId,
        name: item.name,
        category: item.category,
        status: item.status,
        expiration_date: item.expiryDate ?? null,
        is_shopping_list: item.status !== "あり",
      })),
    )
    .select("*");

  if (error) {
    console.error("[inventory/bulk] insert failed:", error);
    return NextResponse.json(
      {
        error: error.message || "一括登録に失敗しました。",
        details: formatSupabaseError(error),
      },
      { status: 500 },
    );
  }

  console.log("[inventory/bulk] inserted items:", data?.length ?? 0);

  return NextResponse.json({
    items: (data ?? []).map((row) => rowToInventoryItemFromRow(row)),
  });
}
