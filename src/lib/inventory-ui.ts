import type { LucideIcon } from "lucide-react";
import { Apple, Package, Sparkles } from "lucide-react";
import type { InventoryItem, ItemCategory, StockStatus } from "@/lib/inventory";

export type UrgencyLevel = "red" | "amber" | "green";

export type CategoryUiConfig = {
  pill: string;
  icon: LucideIcon;
  dot: string;
};

export const CATEGORY_UI: Record<ItemCategory, CategoryUiConfig> = {
  食材: {
    pill: "bg-rose-50 text-rose-700 ring-rose-100",
    icon: Apple,
    dot: "bg-rose-300",
  },
  調味料: {
    pill: "bg-amber-50 text-amber-800 ring-amber-100",
    icon: Sparkles,
    dot: "bg-amber-300",
  },
  日用品: {
    pill: "bg-sky-50 text-sky-800 ring-sky-100",
    icon: Package,
    dot: "bg-sky-300",
  },
};

export const URGENCY_RING: Record<UrgencyLevel, string> = {
  red: "ring-red-200",
  amber: "ring-amber-200",
  green: "ring-emerald-200",
};

export const URGENCY_DOT: Record<UrgencyLevel, string> = {
  red: "bg-red-500 shadow-[0_0_0_3px_rgba(239,68,68,0.25)]",
  amber: "bg-amber-400 shadow-[0_0_0_3px_rgba(251,191,36,0.3)]",
  green: "bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.25)]",
};

export const URGENCY_BADGE: Record<UrgencyLevel, string> = {
  red: "bg-red-50 text-red-700 ring-red-100",
  amber: "bg-amber-50 text-amber-800 ring-amber-100",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-100",
};

/** 期限・残量の総合優先度（信号機カラー） */
export function getItemUrgency(item: InventoryItem): UrgencyLevel {
  if (item.status === "なし" || item.status === "残りわずか") {
    return "red";
  }

  const hasExpiry = item.expiryDays < 999;

  if (hasExpiry) {
    if (item.expiryDays <= 0) {
      return "red";
    }
    if (item.expiryDays <= 3) {
      return "amber";
    }
  }

  return "green";
}

export function urgencyLabel(
  urgency: UrgencyLevel,
  expiryDays: number,
  status: StockStatus,
  expiryDate?: string,
): string {
  if (status === "なし") return "在庫なし";
  if (status === "残りわずか") return "残りわずか";

  if (expiryDate && expiryDays < 999) {
    if (expiryDays <= 0) return "期限切れ / 本日";
    if (expiryDays <= 3) return `あと${expiryDays}日`;
    return "期限に余裕";
  }

  if (expiryDays >= 999) {
    return "在庫十分";
  }

  if (urgency === "green") return "在庫十分";
  return "";
}

export function urgencyBadgeClass(item: InventoryItem): string {
  return URGENCY_BADGE[getItemUrgency(item)];
}
