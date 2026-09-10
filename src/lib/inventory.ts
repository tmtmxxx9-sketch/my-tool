import { createClient } from "@/utils/supabase/client";
import { BulkInsertError, formatSupabaseError, getErrorMessage } from "@/lib/client-error";
import { resolveUserGroupId } from "@/lib/group-membership";
import type { ItemRow } from "./supabase";

export type ItemCategory = "食材" | "調味料" | "日用品";
export type StockStatus = "残りわずか" | "なし" | "あり";

export type InventoryItem = {
  id: string;
  name: string;
  category: ItemCategory;
  location: string;
  expiryDays: number;
  expiryDate?: string;
  status: StockStatus;
  inShoppingList: boolean;
};

const DEFAULT_LOCATION: Record<ItemCategory, string> = {
  食材: "冷蔵庫",
  調味料: "キッチン棚",
  日用品: "リビング",
};

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function toItemCategory(value: string): ItemCategory {
  if (value === "食材" || value === "調味料" || value === "日用品") {
    return value;
  }
  return "食材";
}

function toStockStatus(value: string): StockStatus {
  if (value === "あり" || value === "残りわずか" || value === "なし") {
    return value;
  }
  return "あり";
}

export function rowToInventoryItem(row: ItemRow): InventoryItem {
  const category = toItemCategory(row.category);
  const expiryDate = row.expiration_date ?? undefined;
  const expiryDays = expiryDate ? Math.max(daysUntil(expiryDate), 0) : 999;

  return {
    id: row.id,
    name: row.name,
    category,
    location: DEFAULT_LOCATION[category],
    expiryDays,
    expiryDate,
    status: toStockStatus(row.status),
    inShoppingList: row.is_shopping_list,
  };
}

async function getUserGroupId(): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new BulkInsertError("ログインが必要です。再ログインしてください。", {
      responseBody: authError,
    });
  }

  return resolveUserGroupId(supabase, user.id);
}

export async function fetchInventoryItems(): Promise<InventoryItem[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("items")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data as ItemRow[]).map(rowToInventoryItem);
}

export async function insertInventoryItem(input: {
  name: string;
  category: ItemCategory;
  status: StockStatus;
  expiryDate?: string;
}): Promise<InventoryItem> {
  const supabase = createClient();
  const groupId = await getUserGroupId();

  const { data, error } = await supabase
    .from("items")
    .insert({
      group_id: groupId,
      name: input.name,
      category: input.category,
      status: input.status,
      expiration_date: input.expiryDate || null,
      is_shopping_list: input.status !== "あり",
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return rowToInventoryItem(data as ItemRow);
}

export async function bulkInsertInventoryItems(
  items: Array<{
    name: string;
    category?: ItemCategory;
    status?: StockStatus;
    expiryDate?: string;
  }>,
): Promise<InventoryItem[]> {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new BulkInsertError("ログインが必要です。再ログインしてください。", {
      responseBody: authError,
    });
  }

  let groupId: string;
  try {
    groupId = await resolveUserGroupId(supabase, user.id);
  } catch (error) {
    if (error instanceof BulkInsertError) {
      throw error;
    }
    throw new BulkInsertError(getErrorMessage(error, "所属グループの取得に失敗しました。"), {
      cause: error,
    });
  }

  const { data, error } = await supabase
    .from("items")
    .insert(
      items.map((item) => ({
        group_id: groupId,
        name: item.name.trim(),
        category: item.category ?? "食材",
        status: item.status ?? "あり",
        expiration_date: item.expiryDate ?? null,
        is_shopping_list: (item.status ?? "あり") !== "あり",
      })),
    )
    .select("*");

  if (error) {
    throw new BulkInsertError(
      `在庫の登録に失敗しました: ${formatSupabaseError(error)}`,
      { responseBody: error },
    );
  }

  if (!data?.length) {
    throw new BulkInsertError("登録できた商品がありません。");
  }

  return (data as ItemRow[]).map(rowToInventoryItem);
}

export async function updateInventoryItem(
  id: string,
  patch: Partial<{
    status: StockStatus;
    category: ItemCategory;
    is_shopping_list: boolean;
  }>,
): Promise<InventoryItem> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("items")
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return rowToInventoryItem(data as ItemRow);
}

export async function deleteInventoryItem(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("items").delete().eq("id", id);

  if (error) {
    throw error;
  }
}

export async function signOut(): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw error;
  }
}
