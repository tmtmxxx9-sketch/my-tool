"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarDays,
  Camera,
  ClipboardCopy,
  Loader2,
  LogOut,
  MapPin,
  Plus,
  ShoppingCart,
  Trash2,
  X,
} from "lucide-react";
import {
  fetchInventoryItems,
  insertInventoryItem,
  bulkInsertInventoryItems,
  updateInventoryItem,
  deleteInventoryItem,
  signOut,
  type InventoryItem,
  type ItemCategory,
  type StockStatus,
} from "@/lib/inventory";
import { copyOrShareText } from "@/lib/clipboard";
import {
  formatBulkInsertErrorMessage,
  logClientError,
} from "@/lib/client-error";

type Category = "すべて" | "食材" | "調味料" | "日用品";
type ViewMode = "attention" | "all";

type NewItemForm = {
  name: string;
  category: ItemCategory;
  expiryDate: string;
  status: StockStatus;
};

type ReceiptCandidate = {
  id: string;
  name: string;
  price?: number;
  checked: boolean;
};

type AddModalMode = "receipt" | "manual";

const CATEGORIES: Category[] = ["すべて", "食材", "調味料", "日用品"];
const ITEM_CATEGORIES: ItemCategory[] = ["食材", "調味料", "日用品"];
const STOCK_STATUSES: StockStatus[] = ["あり", "残りわずか", "なし"];
const QUICK_NAME_CHIPS = [
  "豆腐",
  "納豆",
  "牛乳",
  "たまご",
  "食パン",
  "鶏肉",
  "豚肉",
  "玉ねぎ",
] as const;
const VIEW_MODES: { id: ViewMode; label: string }[] = [
  { id: "attention", label: "買い足し" },
  { id: "all", label: "すべての在庫" },
];

/** レシート自動読み取り（Vision API）を使う場合は true に変更 */
const RECEIPT_OCR_ENABLED = true;
const DEFAULT_ADD_MODAL_MODE: AddModalMode = RECEIPT_OCR_ENABLED
  ? "receipt"
  : "manual";

function expiryBadgeClass(days: number): string {
  if (days <= 2) {
    return "bg-red-100 text-red-700 border-red-200";
  }
  if (days <= 5) {
    return "bg-amber-100 text-amber-800 border-amber-200";
  }
  return "bg-slate-100 text-slate-600 border-slate-200";
}

function statusBadgeClass(status: StockStatus): string {
  if (status === "なし") {
    return "bg-red-100 text-red-700";
  }
  if (status === "残りわずか") {
    return "bg-amber-100 text-amber-800";
  }
  return "bg-emerald-100 text-emerald-700";
}

function statusToggleClass(status: StockStatus, isActive: boolean): string {
  if (!isActive) {
    return "bg-white text-slate-600 ring-1 ring-slate-200";
  }
  if (status === "あり") {
    return "bg-emerald-600 text-white shadow-sm";
  }
  if (status === "残りわずか") {
    return "bg-amber-500 text-white shadow-sm";
  }
  return "bg-red-500 text-white shadow-sm";
}

function expiryLabel(days: number, expiryDate?: string): string {
  if (expiryDate) {
    return expiryDate.replaceAll("-", "/");
  }
  if (days >= 999) {
    return "期限なし";
  }
  return `あと${days}日`;
}

function createEmptyForm(): NewItemForm {
  return {
    name: "",
    category: "食材",
    expiryDate: "",
    status: "あり",
  };
}

function createReceiptId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `receipt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createReceiptCandidate(
  name: string,
  price?: number,
): ReceiptCandidate {
  return {
    id: createReceiptId(),
    name,
    price,
    checked: true,
  };
}

type OcrApiResponse = {
  items?: Array<{ name?: string; price?: number }>;
  error?: string;
};

function parseOcrResponseItems(data: OcrApiResponse): ReceiptCandidate[] {
  if (!Array.isArray(data.items) || data.items.length === 0) {
    return [];
  }

  return data.items
    .map((item) => {
      const name = typeof item?.name === "string" ? item.name.trim() : "";
      if (!name) {
        return null;
      }

      const price =
        typeof item.price === "number" && Number.isFinite(item.price)
          ? item.price
          : undefined;

      return createReceiptCandidate(name, price);
    })
    .filter((item): item is ReceiptCandidate => item !== null);
}

export default function HomePage() {
  const router = useRouter();
  const [activeCategory, setActiveCategory] = useState<Category>("すべて");
  const [viewMode, setViewMode] = useState<ViewMode>("attention");
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showShoppingModal, setShowShoppingModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addModalMode, setAddModalMode] =
    useState<AddModalMode>(DEFAULT_ADD_MODAL_MODE);
  const [receiptItems, setReceiptItems] = useState<ReceiptCandidate[]>([]);
  const [newItemForm, setNewItemForm] = useState<NewItemForm>(createEmptyForm);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [bulkRegisterError, setBulkRegisterError] = useState<string | null>(
    null,
  );
  const [selectedPhotoPreview, setSelectedPhotoPreview] = useState<string | null>(
    null,
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const isProcessingRef = useRef(false);

  const clearSelectedPhoto = useCallback(() => {
    setSelectedPhotoPreview((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return null;
    });
    if (photoInputRef.current) {
      photoInputRef.current.value = "";
    }
  }, []);

  const closeAddModal = useCallback(() => {
    setShowAddModal(false);
    setAddModalMode(DEFAULT_ADD_MODAL_MODE);
    setReceiptItems([]);
    setNewItemForm(createEmptyForm());
    setBulkRegisterError(null);
    setIsProcessing(false);
    isProcessingRef.current = false;
    clearSelectedPhoto();
  }, [clearSelectedPhoto]);

  const openAddModal = useCallback(() => {
    setAddModalMode(DEFAULT_ADD_MODAL_MODE);
    setReceiptItems([]);
    setNewItemForm(createEmptyForm());
    clearSelectedPhoto();
    setShowAddModal(true);
  }, [clearSelectedPhoto]);

  const handleImageChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    if (!RECEIPT_OCR_ENABLED) {
      event.target.value = "";
      setToastMessage("レシート自動読み取りは現在利用できません");
      return;
    }

    if (isProcessingRef.current) {
      event.target.value = "";
      return;
    }

    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    isProcessingRef.current = true;
    setIsProcessing(true);

    setSelectedPhotoPreview((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return URL.createObjectURL(file);
    });

    try {
      const base64String = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === "string") {
            resolve(reader.result);
            return;
          }
          reject(new Error("画像の読み込みに失敗しました"));
        };
        reader.onerror = () => {
          reject(reader.error ?? new Error("画像の読み込みに失敗しました"));
        };
        reader.readAsDataURL(file);
      });

      console.log("Sending image payload length:", base64String.length);

      const response = await fetch("/api/ocr", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          imageBase64: base64String,
          mimeType: file.type || "image/jpeg",
        }),
      });

      const data = (await response.json()) as OcrApiResponse;

      if (!response.ok) {
        setToastMessage(data.error ?? "読み取りに失敗しました");
        return;
      }

      const parsedItems = parseOcrResponseItems(data);
      console.log("[OCR UI] received items:", parsedItems.length, data.items?.length);

      if (parsedItems.length > 0) {
        setReceiptItems(parsedItems);
        setAddModalMode("receipt");
        setToastMessage(`${parsedItems.length}件の商品を読み取りました`);
        return;
      }

      setReceiptItems([]);
      setAddModalMode("receipt");
      setToastMessage("商品を読み取れませんでした。手動で追加してください");
    } catch (error) {
      console.error("[OCR UI] handleImageChange failed:", error);
      setReceiptItems([]);
      setToastMessage("読み取りに失敗しました");
    } finally {
      isProcessingRef.current = false;
      setIsProcessing(false);
      event.target.value = "";
    }
  };

  const loadItems = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchInventoryItems();
      setItems(data);
    } catch {
      setToastMessage("在庫データの取得に失敗しました");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  useEffect(() => {
    if (!toastMessage) {
      return;
    }
    const timer = window.setTimeout(() => setToastMessage(null), 2200);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  const shoppingItems = useMemo(
    () =>
      items.filter(
        (item) => item.status === "残りわずか" || item.status === "なし",
      ),
    [items],
  );

  const shoppingCount = shoppingItems.length;

  const alertItems = useMemo(() => {
    return items
      .filter((item) => item.expiryDays <= 5)
      .filter(
        (item) => activeCategory === "すべて" || item.category === activeCategory,
      )
      .sort((a, b) => a.expiryDays - b.expiryDays);
  }, [activeCategory, items]);

  const displayedItems = useMemo(() => {
    return items
      .filter((item) => {
        if (activeCategory !== "すべて" && item.category !== activeCategory) {
          return false;
        }
        if (viewMode === "attention") {
          return item.status === "残りわずか" || item.status === "なし";
        }
        return true;
      })
      .sort((a, b) => {
        if (viewMode === "attention" && a.status !== b.status) {
          const order: Record<StockStatus, number> = {
            なし: 0,
            残りわずか: 1,
            あり: 2,
          };
          return order[a.status] - order[b.status];
        }
        if (viewMode === "all" && a.status !== b.status) {
          const order: Record<StockStatus, number> = {
            なし: 0,
            残りわずか: 1,
            あり: 2,
          };
          return order[a.status] - order[b.status];
        }
        return a.expiryDays - b.expiryDays;
      });
  }, [activeCategory, items, viewMode]);

  const handleMarkPurchased = async (id: string) => {
    const current = items.find((item) => item.id === id);
    if (!current || current.status === "あり") {
      return;
    }

    await handleSetStatus(id, "あり");
    setToastMessage(`${current.name} を購入済みにしました`);
  };

  const handleSetStatus = async (id: string, newStatus: StockStatus) => {
    const current = items.find((item) => item.id === id);
    if (!current || current.status === newStatus) {
      return;
    }

    const inShoppingList = newStatus !== "あり";

    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, status: newStatus, inShoppingList }
          : item,
      ),
    );

    try {
      const updated = await updateInventoryItem(id, {
        status: newStatus,
        is_shopping_list: inShoppingList,
      });
      setItems((prev) =>
        prev.map((item) => (item.id === id ? updated : item)),
      );
    } catch {
      setItems((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                status: current.status,
                inShoppingList: current.inShoppingList,
              }
            : item,
        ),
      );
      setToastMessage("ステータスの更新に失敗しました");
    }
  };

  const handleChangeCategory = async (id: string, category: ItemCategory) => {
    const current = items.find((item) => item.id === id);
    if (!current || current.category === category) {
      return;
    }

    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, category } : item,
      ),
    );

    try {
      const updated = await updateInventoryItem(id, { category });
      setItems((prev) =>
        prev.map((item) => (item.id === id ? updated : item)),
      );
    } catch {
      setItems((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, category: current.category } : item,
        ),
      );
      setToastMessage("カテゴリの更新に失敗しました");
    }
  };

  const handleDeleteItem = async (id: string) => {
    const current = items.find((item) => item.id === id);
    if (!current) {
      return;
    }

    setItems((prev) => prev.filter((item) => item.id !== id));

    try {
      await deleteInventoryItem(id);
      setToastMessage(`${current.name} を削除しました`);
    } catch {
      setItems((prev) => [current, ...prev]);
      setToastMessage("削除に失敗しました");
    }
  };

  const handleCopyShoppingList = async () => {
    if (shoppingItems.length === 0) {
      setToastMessage("買い物リストが空です");
      return;
    }

    const text = [
      "【買い物リスト】",
      ...shoppingItems.map((item) => `・${item.name}`),
    ].join("\n");

    const result = await copyOrShareText(text, "買い物リスト");

    if (result === "shared") {
      setToastMessage("共有を開きました");
      return;
    }
    if (result === "copied") {
      setToastMessage("コピーしました！");
      return;
    }
    if (result === "cancelled") {
      return;
    }
    setToastMessage("コピーに失敗しました");
  };

  const handleAddNewItem = async () => {
    const name = newItemForm.name.trim();
    if (!name) {
      setToastMessage("品名を入力してください");
      return;
    }

    setIsSaving(true);
    try {
      const created = await insertInventoryItem({
        name,
        category: newItemForm.category,
        status: newItemForm.status,
        expiryDate: newItemForm.expiryDate || undefined,
      });

      setItems((prev) => [created, ...prev]);
      setNewItemForm(createEmptyForm());
      setAddModalMode(DEFAULT_ADD_MODAL_MODE);
      setToastMessage(`${name} を登録しました`);
    } catch {
      setToastMessage("登録に失敗しました");
    } finally {
      setIsSaving(false);
    }
  };

  const handleBulkRegister = async () => {
    if (isSaving) {
      return;
    }

    const selected = receiptItems.filter(
      (item) => item.checked && item.name.trim().length > 0,
    );

    if (selected.length === 0) {
      setToastMessage("登録する商品を選んでください");
      return;
    }

    setIsSaving(true);
    setBulkRegisterError(null);
    try {
      const created = await bulkInsertInventoryItems(
        selected.map((item) => ({
          name: item.name.trim(),
          category: "食材" as const,
          status: "あり" as const,
        })),
      );

      setItems((prev) => [...created, ...prev]);
      closeAddModal();
      setToastMessage(`${created.length}件を在庫に登録しました`);
    } catch (error) {
      logClientError("Bulk register", error);
      const message = formatBulkInsertErrorMessage(error);
      setBulkRegisterError(message);
      setToastMessage(message);
    } finally {
      setIsSaving(false);
    }
  };

  const updateReceiptItem = (
    id: string,
    patch: Partial<Pick<ReceiptCandidate, "name" | "checked">>,
  ) => {
    setReceiptItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  };

  const removeReceiptItem = (id: string) => {
    setReceiptItems((prev) => prev.filter((item) => item.id !== id));
  };

  const addManualReceiptRow = () => {
    setReceiptItems((prev) => [
      ...prev,
      createReceiptCandidate(""),
    ]);
  };

  const checkedReceiptCount = receiptItems.filter((item) => item.checked).length;
  const selectableReceiptCount = receiptItems.filter(
    (item) => item.checked && item.name.trim().length > 0,
  ).length;
  const isReceiptReviewMode = receiptItems.length > 0;

  const toggleAllReceiptItems = (checked: boolean) => {
    setReceiptItems((prev) => prev.map((item) => ({ ...item, checked })));
  };

  const handleLogout = async () => {
    try {
      await signOut();
      router.replace("/login");
      router.refresh();
    } catch {
      setToastMessage("ログアウトに失敗しました");
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-slate-50 pb-28">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              ストックノート
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">
              残り少ないものと期限をまとめて確認
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="ログアウト"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>

        <div className="mx-4 mb-3 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
          {VIEW_MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => setViewMode(mode.id)}
              className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                viewMode === mode.id
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500"
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2 overflow-x-auto px-4 pb-3">
          {viewMode === "all" ? (
            <>
              <span className="mr-1 shrink-0 self-center text-xs font-medium text-slate-500">
                カテゴリ
              </span>
              {CATEGORIES.map((category) => {
                const isActive = activeCategory === category;
                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setActiveCategory(category)}
                    className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${
                      isActive
                        ? "bg-emerald-600 text-white shadow-sm"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {category}
                  </button>
                );
              })}
            </>
          ) : (
            CATEGORIES.map((category) => {
              const isActive = activeCategory === category;
              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => setActiveCategory(category)}
                  className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${
                    isActive
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {category}
                </button>
              );
            })
          )}
        </div>
      </header>

      <main className="flex-1 space-y-5 px-4 pt-4">
        <section aria-label="賞味期限アラート">
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <h2 className="text-sm font-semibold text-slate-800">
              賞味期限アラート
            </h2>
          </div>

          {isLoading ? (
            <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
              読み込み中...
            </p>
          ) : alertItems.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
              期限が近いアイテムはありません
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {alertItems.map((item) => (
                <span
                  key={item.id}
                  className={`inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium ${expiryBadgeClass(item.expiryDays)}`}
                >
                  {item.name} {expiryLabel(item.expiryDays, item.expiryDate)}
                </span>
              ))}
            </div>
          )}
        </section>

        <section aria-label="在庫一覧">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">
              {viewMode === "attention" ? "買い足しリスト" : "すべての在庫"}
            </h2>
            <span className="text-xs text-slate-500">{displayedItems.length}件</span>
          </div>

          <div className="space-y-3">
            {isLoading ? (
              <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
                読み込み中...
              </p>
            ) : displayedItems.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
                {viewMode === "attention"
                  ? "買い足しが必要なものはありません"
                  : "この条件に該当する在庫はありません"}
              </p>
            ) : (
              displayedItems.map((item) => (
                <article
                  key={item.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  {viewMode === "all" ? (
                    <div className="space-y-3">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <h3 className="text-base font-semibold text-slate-900">
                            {item.name}
                          </h3>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                            <p className="flex items-center gap-1.5">
                              <MapPin className="h-4 w-4 shrink-0 text-slate-400" />
                              {item.location}
                            </p>
                            <p className="flex items-center gap-1.5">
                              <CalendarDays className="h-4 w-4 shrink-0 text-slate-400" />
                              {expiryLabel(item.expiryDays, item.expiryDate)}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleDeleteItem(item.id)}
                          className="shrink-0 rounded-xl p-3 text-slate-400 transition hover:bg-red-50 hover:text-red-500 active:scale-95"
                          aria-label={`${item.name}を削除`}
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </div>

                      <label className="block">
                        <span className="mb-1.5 block text-xs font-medium text-slate-500">
                          カテゴリ
                        </span>
                        <select
                          value={item.category}
                          onChange={(event) =>
                            void handleChangeCategory(
                              item.id,
                              event.target.value as ItemCategory,
                            )
                          }
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-emerald-500 focus:ring-2"
                        >
                          {ITEM_CATEGORIES.map((category) => (
                            <option key={category} value={category}>
                              {category}
                            </option>
                          ))}
                        </select>
                      </label>

                      <div>
                        <span className="mb-1.5 block text-xs font-medium text-slate-500">
                          状態
                        </span>
                        <div className="grid grid-cols-3 gap-2">
                          {STOCK_STATUSES.map((status) => (
                            <button
                              key={status}
                              type="button"
                              onClick={() => void handleSetStatus(item.id, status)}
                              className={`rounded-xl px-2 py-2.5 text-xs font-semibold transition active:scale-[0.98] sm:text-sm ${statusToggleClass(status, item.status === status)}`}
                            >
                              {status}
                            </button>
                          ))}
                        </div>
                      </div>

                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold text-slate-900">
                            {item.name}
                          </h3>
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass(item.status)}`}
                          >
                            {item.status}
                          </span>
                        </div>

                        <div className="mt-2 space-y-1.5 text-sm text-slate-600">
                          <p className="flex items-center gap-1.5">
                            <MapPin className="h-4 w-4 shrink-0 text-slate-400" />
                            {item.location}
                          </p>
                          <p className="flex items-center gap-1.5">
                            <CalendarDays className="h-4 w-4 shrink-0 text-slate-400" />
                            賞味期限: {expiryLabel(item.expiryDays, item.expiryDate)}
                          </p>
                          <p className="text-xs text-slate-500">{item.category}</p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => void handleMarkPurchased(item.id)}
                        className="flex min-h-16 shrink-0 flex-col items-center justify-center rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 active:scale-[0.97]"
                      >
                        購入済み
                      </button>
                    </div>
                  )}
                </article>
              ))
            )}
          </div>
        </section>
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto grid max-w-md grid-cols-2 gap-3 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => setShowShoppingModal(true)}
            className="relative flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-slate-900 text-sm font-semibold text-white shadow-sm active:scale-[0.98]"
          >
            <ShoppingCart className="h-5 w-5" />
            買い物リスト
            <span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">
              {shoppingCount}
            </span>
          </button>

          <button
            type="button"
            onClick={openAddModal}
            className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-sm font-semibold text-white shadow-sm active:scale-[0.98]"
          >
            <Plus className="h-5 w-5" />
            新規登録
          </button>
        </div>
      </footer>

      {showShoppingModal && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/45 p-4 sm:items-center">
          <div
            className="absolute inset-0"
            aria-hidden
            onClick={() => setShowShoppingModal(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-3xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">買い物リスト</h2>
              <button
                type="button"
                onClick={() => setShowShoppingModal(false)}
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
                aria-label="閉じる"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {shoppingItems.length === 0 ? (
              <p className="rounded-2xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                買い足しが必要なものはありません
              </p>
            ) : (
              <ul className="max-h-72 space-y-2 overflow-y-auto">
                {shoppingItems.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-3 rounded-2xl border border-slate-200 px-3 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900">{item.name}</p>
                      <p className="text-xs text-slate-500">
                        {item.category} · {item.status}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleMarkPurchased(item.id)}
                      className="flex min-h-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm active:scale-[0.97]"
                    >
                      購入済み
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <button
              type="button"
              onClick={() => void handleCopyShoppingList()}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white"
            >
              <ClipboardCopy className="h-4 w-4" />
              LINE用にコピー
            </button>
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/45 p-4 sm:items-center">
          <div
            className="absolute inset-0"
            aria-hidden
            onClick={closeAddModal}
          />
          <div className="relative z-10 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {RECEIPT_OCR_ENABLED && isReceiptReviewMode
                    ? "レシート一括確認"
                    : RECEIPT_OCR_ENABLED
                      ? "レシート一括登録"
                      : "新規登録"}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {RECEIPT_OCR_ENABLED && isReceiptReviewMode
                    ? "チェックと修正をしてから在庫に追加"
                    : RECEIPT_OCR_ENABLED
                      ? "レシートを撮影して購入品をまとめて登録"
                      : "品名とカテゴリを入力して追加"}
                </p>
              </div>
              <button
                type="button"
                onClick={closeAddModal}
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
                aria-label="閉じる"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {RECEIPT_OCR_ENABLED && addModalMode === "receipt" ? (
              <>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  disabled={isProcessing}
                  onChange={handleImageChange}
                />

                {isReceiptReviewMode ? (
                  <div className="space-y-4">
                    {(selectedPhotoPreview || isProcessing) && (
                      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        {selectedPhotoPreview ? (
                          <img
                            src={selectedPhotoPreview}
                            alt="選択したレシートのプレビュー"
                            className="h-16 w-16 shrink-0 rounded-xl object-cover"
                          />
                        ) : null}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-800">
                            {isProcessing
                              ? "レシートを解析中..."
                              : `${receiptItems.length}件を読み取りました`}
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              if (isProcessing || isProcessingRef.current) {
                                return;
                              }
                              photoInputRef.current?.click();
                            }}
                            disabled={isProcessing}
                            className="mt-1 text-sm font-medium text-emerald-700 disabled:opacity-60"
                          >
                            レシートを再スキャン
                          </button>
                        </div>
                        {isProcessing ? (
                          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-emerald-600" />
                        ) : null}
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-slate-800">
                        読み取り結果
                      </h3>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-500">
                          {checkedReceiptCount}/{receiptItems.length} 件選択
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleAllReceiptItems(true)}
                          className="rounded-full bg-emerald-50 px-2 py-1 font-medium text-emerald-700"
                        >
                          全選択
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleAllReceiptItems(false)}
                          className="rounded-full bg-slate-100 px-2 py-1 font-medium text-slate-600"
                        >
                          全解除
                        </button>
                      </div>
                    </div>

                    <ul className="max-h-[min(50vh,20rem)] space-y-2 overflow-y-auto">
                      {receiptItems.map((item) => (
                        <li
                          key={item.id}
                          className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm"
                        >
                          <input
                            type="checkbox"
                            checked={item.checked}
                            onChange={(event) =>
                              updateReceiptItem(item.id, {
                                checked: event.target.checked,
                              })
                            }
                            className="mt-3 h-5 w-5 shrink-0 rounded border-slate-300 text-emerald-600"
                          />
                          <div className="min-w-0 flex-1">
                            <input
                              type="text"
                              value={item.name}
                              onChange={(event) =>
                                updateReceiptItem(item.id, {
                                  name: event.target.value,
                                })
                              }
                              placeholder="品名"
                              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base outline-none ring-emerald-500 focus:ring-2"
                            />
                            {item.price !== undefined ? (
                              <p className="mt-1.5 text-xs text-slate-500">
                                ¥{item.price.toLocaleString()}
                              </p>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            onClick={() => removeReceiptItem(item.id)}
                            className="mt-1 rounded-full p-2 text-slate-400 hover:bg-red-50 hover:text-red-500 active:scale-95"
                            aria-label="削除"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </li>
                      ))}
                    </ul>

                    <button
                      type="button"
                      onClick={addManualReceiptRow}
                      className="flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-emerald-300 bg-emerald-50 px-3 py-3 text-sm font-semibold text-emerald-700 active:scale-[0.98]"
                    >
                      <Plus className="h-4 w-4" />
                      リストに行を追加
                    </button>

                    {bulkRegisterError ? (
                      <p
                        role="alert"
                        className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700"
                      >
                        {bulkRegisterError}
                      </p>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => void handleBulkRegister()}
                      disabled={isSaving || selectableReceiptCount === 0}
                      className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3.5 text-sm font-semibold text-white shadow-sm active:scale-[0.98] disabled:opacity-60"
                    >
                      <Plus className="h-4 w-4" />
                      {isSaving
                        ? "登録中..."
                        : `チェックした商品を一括で在庫に追加（${selectableReceiptCount}件）`}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setAddModalMode("manual");
                        setNewItemForm(createEmptyForm());
                      }}
                      className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 active:scale-[0.98]"
                    >
                      <Plus className="h-4 w-4 text-emerald-600" />
                      ＋ 手動で食材を追加
                    </button>
                  </div>
                ) : (
                  <>
                    {!isProcessing && (
                      <p className="mb-4 rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                        レシートを撮影すると、購入商品の一覧が表示されます
                      </p>
                    )}

                    <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-4">
                      <button
                        type="button"
                        onClick={() => {
                          if (isProcessing || isProcessingRef.current) {
                            return;
                          }
                          photoInputRef.current?.click();
                        }}
                        disabled={isProcessing}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm ring-1 ring-slate-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isProcessing ? (
                          <>
                            <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
                            レシートを解析中...
                          </>
                        ) : (
                          <>
                            <Camera className="h-5 w-5 text-emerald-600" />
                            レシートを撮影 / アップロード
                          </>
                        )}
                      </button>

                      {selectedPhotoPreview && (
                        <div className="mt-3">
                          <img
                            src={selectedPhotoPreview}
                            alt="選択したレシートのプレビュー"
                            className="max-h-48 w-full rounded-xl object-cover"
                          />
                          {isProcessing ? (
                            <div className="mt-2 flex items-center justify-center gap-2 text-sm text-slate-500">
                              <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
                              解析中...
                            </div>
                          ) : (
                            <p className="mt-2 text-center text-sm font-medium text-emerald-700">
                              レシートを読み込みました
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setAddModalMode("manual");
                        setNewItemForm(createEmptyForm());
                      }}
                      className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 active:scale-[0.98]"
                    >
                      <Plus className="h-4 w-4 text-emerald-600" />
                      ＋ 手動で食材を追加
                    </button>
                  </>
                )}
              </>
            ) : (
              <div className="space-y-4">
                {RECEIPT_OCR_ENABLED ? (
                  <button
                    type="button"
                    onClick={() => setAddModalMode("receipt")}
                    className="text-sm font-medium text-emerald-700"
                  >
                    ← レシート登録に戻る
                  </button>
                ) : (
                  <p className="rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-600">
                    レシート自動読み取りは現在停止中です。手動で登録してください。
                  </p>
                )}

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">
                    品名
                  </span>
                  <div className="relative">
                    <input
                      ref={nameInputRef}
                      type="text"
                      value={newItemForm.name}
                      onChange={(event) =>
                        setNewItemForm((prev) => ({
                          ...prev,
                          name: event.target.value,
                        }))
                      }
                      placeholder="例：牛乳"
                      className={`w-full rounded-xl border border-slate-200 py-3 pl-3 text-base outline-none ring-emerald-500 focus:ring-2 ${
                        newItemForm.name ? "pr-11" : "pr-3"
                      }`}
                    />
                    {newItemForm.name ? (
                      <button
                        type="button"
                        aria-label="品名をクリア"
                        onClick={() => {
                          setNewItemForm((prev) => ({ ...prev, name: "" }));
                          nameInputRef.current?.focus();
                        }}
                        className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 active:scale-95"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                  <div className="-mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {QUICK_NAME_CHIPS.map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => {
                          setNewItemForm((prev) => ({ ...prev, name: chip }));
                          nameInputRef.current?.focus();
                        }}
                        className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800 transition active:scale-[0.98] hover:bg-emerald-100"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">
                    カテゴリ
                  </span>
                  <select
                    value={newItemForm.category}
                    onChange={(event) =>
                      setNewItemForm((prev) => ({
                        ...prev,
                        category: event.target.value as ItemCategory,
                      }))
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-3 text-base outline-none ring-emerald-500 focus:ring-2"
                  >
                    {ITEM_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">
                    賞味期限
                  </span>
                  <input
                    type="date"
                    value={newItemForm.expiryDate}
                    onChange={(event) =>
                      setNewItemForm((prev) => ({
                        ...prev,
                        expiryDate: event.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-3 text-base outline-none ring-emerald-500 focus:ring-2"
                  />
                </label>

                <fieldset>
                  <legend className="mb-2 block text-sm font-medium text-slate-700">
                    状態
                  </legend>
                  <div className="grid grid-cols-3 gap-2">
                    {STOCK_STATUSES.map((status) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() =>
                          setNewItemForm((prev) => ({ ...prev, status }))
                        }
                        className={`rounded-xl px-2 py-2 text-sm font-semibold ${
                          newItemForm.status === status
                            ? "bg-emerald-600 text-white"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <button
                  type="button"
                  onClick={() => void handleAddNewItem()}
                  disabled={isSaving}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                >
                  <Plus className="h-4 w-4" />
                  {isSaving ? "登録中..." : "1件だけ登録する"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {toastMessage && (
        <div className="fixed bottom-24 left-1/2 z-50 w-[min(90vw,20rem)] -translate-x-1/2 rounded-2xl bg-slate-900 px-4 py-3 text-center text-sm font-medium text-white shadow-lg">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
