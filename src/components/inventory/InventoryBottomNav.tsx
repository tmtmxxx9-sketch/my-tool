"use client";

import { ClipboardList, LayoutGrid } from "lucide-react";

export type InventoryViewMode = "attention" | "all";

type Props = {
  viewMode: InventoryViewMode;
  onChange: (mode: InventoryViewMode) => void;
};

export function InventoryBottomNav({ viewMode, onChange }: Props) {
  const tabs: {
    id: InventoryViewMode;
    label: string;
    icon: typeof LayoutGrid;
  }[] = [
    { id: "attention", label: "買い足しリスト", icon: ClipboardList },
    { id: "all", label: "在庫一覧", icon: LayoutGrid },
  ];

  return (
    <nav
      className="fixed inset-x-0 bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] z-30 border-t border-slate-200 bg-white/95 backdrop-blur sm:hidden"
      aria-label="表示切替"
    >
      <div className="mx-auto grid max-w-md grid-cols-2 gap-1 p-2">
        {tabs.map((tab) => {
          const active = viewMode === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-2xl px-2 py-2 text-xs font-semibold transition active:scale-[0.99] ${
                active
                  ? "bg-emerald-50 text-emerald-800 shadow-sm ring-1 ring-emerald-100"
                  : "text-slate-500 hover:bg-slate-50"
              }`}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="h-5 w-5" aria-hidden />
              {tab.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
