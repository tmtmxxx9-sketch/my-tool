import type { InventoryItem } from "@/lib/inventory";
import {
  URGENCY_BADGE,
  URGENCY_DOT,
  getItemUrgency,
  urgencyLabel,
} from "@/lib/inventory-ui";

type Props = {
  item: InventoryItem;
  showLabel?: boolean;
  className?: string;
};

export function UrgencyIndicator({ item, showLabel = true, className = "" }: Props) {
  const urgency = getItemUrgency(item);
  const label = urgencyLabel(urgency, item.expiryDays, item.status, item.expiryDate);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${URGENCY_BADGE[urgency]} ${className}`}
      title={label}
    >
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${URGENCY_DOT[urgency]}`}
        aria-hidden
      />
      {showLabel ? <span>{label}</span> : <span className="sr-only">{label}</span>}
    </span>
  );
}
