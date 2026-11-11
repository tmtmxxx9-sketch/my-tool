import type { ItemCategory } from "@/lib/inventory";
import { CATEGORY_UI } from "@/lib/inventory-ui";

type Props = {
  category: ItemCategory;
  className?: string;
};

export function CategoryBadge({ category, className = "" }: Props) {
  const config = CATEGORY_UI[category];
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${config.pill} ${className}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {category}
    </span>
  );
}
