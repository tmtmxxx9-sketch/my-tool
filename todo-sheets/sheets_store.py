"""Google スプレッドシート ToDo 永続化（gspread）"""

from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass
from datetime import datetime
from typing import Any

import gspread
from google.oauth2.service_account import Credentials

from config import (
    APP_DIR,
    get_service_account_info,
    get_spreadsheet_id,
    get_spreadsheet_id_candidates,
    resolve_credentials_path,
    sanitize_env_string,
)

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
    info = get_service_account_info()
    if info:
        return Credentials.from_service_account_info(info, scopes=SCOPES)

    path = resolve_credentials_path()
    raise FileNotFoundError(
        f"サービスアカウント JSON が見つかりません: {path} "
        f"（ローカル: {APP_DIR}/credentials.json / 本番: 環境変数 GOOGLE_CREDENTIALS_JSON）",
    )


def _log_sheets_error(spreadsheet_id: str, exc: Exception) -> None:
    print(
        f"[Sheets Error] 試行したID: {spreadsheet_id!r}, 詳細: {exc}",
        file=sys.stderr,
        flush=True,
    )


def _open_spreadsheet(client: gspread.Client):
    candidates = get_spreadsheet_id_candidates()
    if not candidates:
        get_spreadsheet_id()  # raises with clear message

    last_404: gspread.exceptions.APIError | None = None
    for spreadsheet_id in candidates:
        try:
            return client.open_by_key(spreadsheet_id)
        except gspread.exceptions.APIError as exc:
            _log_sheets_error(spreadsheet_id, exc)
            status = getattr(getattr(exc, "response", None), "status_code", None)
            if status == 404:
                last_404 = exc
                continue
            raise
        except Exception as exc:
            _log_sheets_error(spreadsheet_id, exc)
            raise

    if last_404 is not None:
        raise last_404
    raise ValueError("スプレッドシート ID を解決できませんでした")


def _worksheet():
    sheet_name = sanitize_env_string(os.getenv("GOOGLE_SHEETS_WORKSHEET", "シート1")) or "シート1"
    client = gspread.authorize(_load_credentials())
    spreadsheet = _open_spreadsheet(client)
    try:
        ws = spreadsheet.worksheet(sheet_name)
    except gspread.WorksheetNotFound:
        try:
            ws = spreadsheet.sheet1
        except Exception as exc:
            raise gspread.WorksheetNotFound(
                f"ワークシート '{sheet_name}' が見つかりません",
            ) from exc

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
