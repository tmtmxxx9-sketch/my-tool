"""todo-sheets 用環境変数の読み込み（アプリ配置ディレクトリ基準）"""

from __future__ import annotations

import os
import re
from pathlib import Path

from dotenv import load_dotenv

APP_DIR = Path(__file__).resolve().parent

# todo-sheets/.env を優先（my-tool ルートから起動しても反映）
load_dotenv(APP_DIR / ".env")
# 任意: ルート .env に GOOGLE_SHEETS_* がある場合のフォールバック
load_dotenv(APP_DIR.parent / ".env")

_SPREADSHEET_ID_PATTERN = re.compile(
    r"/spreadsheets/d/([a-zA-Z0-9-_]+)",
    re.IGNORECASE,
)


def resolve_credentials_path() -> Path:
    raw = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "credentials.json").strip()
    path = Path(raw)
    if not path.is_absolute():
        path = APP_DIR / path
    return path


def get_spreadsheet_id() -> str:
    direct = os.getenv("GOOGLE_SHEETS_SPREADSHEET_ID", "").strip()
    if direct:
        return direct

    url = os.getenv("GOOGLE_SHEETS_SPREADSHEET_URL", "").strip()
    if url:
        match = _SPREADSHEET_ID_PATTERN.search(url)
        if match:
            return match.group(1)
        raise ValueError(
            "GOOGLE_SHEETS_SPREADSHEET_URL の形式が正しくありません。"
            "例: https://docs.google.com/spreadsheets/d/xxxxxxxx/edit",
        )

    raise ValueError(
        "GOOGLE_SHEETS_SPREADSHEET_ID が未設定です。"
        f" {APP_DIR / '.env'} に ID または GOOGLE_SHEETS_SPREADSHEET_URL を設定し、"
        " credentials.json を todo-sheets フォルダに置いてください。",
    )
