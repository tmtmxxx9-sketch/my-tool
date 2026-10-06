"""Google スプレッドシート ToDo 永続化（gspread）"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime
from typing import Any

import gspread
from google.oauth2.service_account import Credentials

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

HEADERS = ["ID", "title", "content", "due_date", "created_at"]


@dataclass
class TodoItem:
    id: str
    title: str
    content: str
    due_date: str
    created_at: str


def _load_credentials() -> Credentials:
    raw_json = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON", "").strip()
    if raw_json:
        info = json.loads(raw_json)
        return Credentials.from_service_account_info(info, scopes=SCOPES)

    path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "credentials.json").strip()
    if not os.path.isfile(path):
        raise FileNotFoundError(
            f"サービスアカウント JSON が見つかりません: {path} "
            "（GOOGLE_APPLICATION_CREDENTIALS または GOOGLE_SERVICE_ACCOUNT_JSON を設定）",
        )
    return Credentials.from_service_account_file(path, scopes=SCOPES)


def _worksheet():
    spreadsheet_id = os.getenv("GOOGLE_SHEETS_SPREADSHEET_ID", "").strip()
    if not spreadsheet_id:
        raise ValueError("GOOGLE_SHEETS_SPREADSHEET_ID が未設定です")

    sheet_name = os.getenv("GOOGLE_SHEETS_WORKSHEET", "Sheet1").strip() or "Sheet1"
    client = gspread.authorize(_load_credentials())
    spreadsheet = client.open_by_key(spreadsheet_id)
    try:
        ws = spreadsheet.worksheet(sheet_name)
    except gspread.WorksheetNotFound:
        ws = spreadsheet.add_worksheet(title=sheet_name, rows=100, cols=len(HEADERS))

    first_row = ws.row_values(1)
    if first_row != HEADERS:
        ws.update("A1:E1", [HEADERS])
    return ws


def _row_to_item(row: list[str]) -> TodoItem | None:
    if len(row) < 5 or not row[0]:
        return None
    return TodoItem(
        id=str(row[0]),
        title=row[1] or "",
        content=row[2] or "",
        due_date=row[3] or "",
        created_at=row[4] or "",
    )


def list_todos() -> list[TodoItem]:
    ws = _worksheet()
    rows = ws.get_all_values()
    items: list[TodoItem] = []
    for row in rows[1:]:
        item = _row_to_item(row)
        if item:
            items.append(item)
    items.sort(key=lambda t: t.id, reverse=True)
    return items


def get_todo(todo_id: str) -> TodoItem | None:
    ws = _worksheet()
    rows = ws.get_all_values()
    for row in rows[1:]:
        item = _row_to_item(row)
        if item and item.id == todo_id:
            return item
    return None


def _next_id(ws: gspread.Worksheet) -> str:
    rows = ws.get_all_values()[1:]
    max_id = 0
    for row in rows:
        if row and row[0].isdigit():
            max_id = max(max_id, int(row[0]))
    return str(max_id + 1)


def create_todo(title: str, content: str, due_date: str) -> TodoItem:
    ws = _worksheet()
    new_id = _next_id(ws)
    created_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    row = [new_id, title.strip(), content.strip(), due_date.strip(), created_at]
    ws.append_row(row, value_input_option="USER_ENTERED")
    return TodoItem(
        id=new_id,
        title=row[1],
        content=row[2],
        due_date=row[3],
        created_at=created_at,
    )


def update_todo(todo_id: str, title: str, content: str, due_date: str) -> bool:
    ws = _worksheet()
    rows = ws.get_all_values()
    for index, row in enumerate(rows[1:], start=2):
        if row and str(row[0]) == todo_id:
            created_at = row[4] if len(row) > 4 else ""
            ws.update(
                f"A{index}:E{index}",
                [[todo_id, title.strip(), content.strip(), due_date.strip(), created_at]],
            )
            return True
    return False
