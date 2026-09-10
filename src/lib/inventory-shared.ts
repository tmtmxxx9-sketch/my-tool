import type { ItemCategory, StockStatus } from "@/lib/inventory";
import {
  formatSupabaseError,
  resolveUserGroupId,
} from "@/lib/group-membership";

type ItemRow = {
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

export function rowToInventoryItemFromRow(row: ItemRow) {
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

export { formatSupabaseError, resolveUserGroupId };
