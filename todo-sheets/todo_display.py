"""一覧表示: ソート・期日バッジ"""

from __future__ import annotations

from datetime import date, datetime, timedelta

from sheets_store import DEFAULT_PRIORITY, PRIORITY_ORDER, TodoItem, normalize_priority

SORT_ID = "id"
SORT_DUE = "due"
SORT_PRIORITY = "priority"


def sort_todos(todos: list[TodoItem], sort_key: str) -> list[TodoItem]:
    items = list(todos)
    if sort_key == SORT_DUE:
        items.sort(key=_due_sort_key)
    elif sort_key == SORT_PRIORITY:
        items.sort(key=_priority_sort_key)
    else:
        items.sort(key=lambda t: int(t.id) if t.id.isdigit() else 0, reverse=True)
    return items


def _due_sort_key(item: TodoItem) -> tuple:
    d = _parse_due_date(item.due_date)
    if d is None:
        return (1, date.max)
    return (0, d)


def _priority_sort_key(item: TodoItem) -> tuple:
    d = _parse_due_date(item.due_date)
    due = d if d is not None else date.max
    return (PRIORITY_ORDER.get(normalize_priority(item.priority), 1), due, -int(item.id or 0))


def _parse_due_date(raw: str) -> date | None:
    text = (raw or "").strip()
    if not text:
        return None
    for fmt in ("%Y-%m-%d", "%Y/%m/%d"):
        try:
            return datetime.strptime(text[:10], fmt).date()
        except ValueError:
            continue
    return None


def due_date_badge(due_raw: str, today: date | None = None) -> dict[str, str] | None:
    """期限切れ / 今日 / 明日 のバッジ情報。期日未設定は None。"""
    today = today or date.today()
    due = _parse_due_date(due_raw)
    if due is None:
        return None
    if due < today:
        return {"label": "期限切れ", "css": "badge badge-overdue"}
    if due == today:
        return {"label": "今日", "css": "badge badge-today"}
    if due == today + timedelta(days=1):
        return {"label": "明日", "css": "badge badge-tomorrow"}
    return None
