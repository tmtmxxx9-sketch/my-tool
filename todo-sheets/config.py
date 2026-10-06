"""todo-sheets 用環境変数の読み込み（アプリ配置ディレクトリ基準）"""

from __future__ import annotations

import json
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


def get_service_account_email() -> str | None:
    """credentials.json または GOOGLE_SERVICE_ACCOUNT_JSON から client_email を取得。"""
    raw_json = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON", "").strip()
    if raw_json:
        try:
            info = json.loads(raw_json)
            email = info.get("client_email")
            return str(email).strip() if email else None
        except json.JSONDecodeError:
            return None

    path = resolve_credentials_path()
    if not path.is_file():
        return None
    try:
        with path.open(encoding="utf-8") as f:
            info = json.load(f)
        email = info.get("client_email")
        return str(email).strip() if email else None
    except (OSError, json.JSONDecodeError):
        return None


def print_setup_status() -> None:
    """起動時に設定状況と共有先メールアドレスをターミナルに表示。"""
    cred_path = resolve_credentials_path()
    email = get_service_account_email()
    try:
        sheet_id = get_spreadsheet_id()
        sheet_hint = f"スプレッドシート ID: {sheet_id[:8]}…"
    except ValueError:
        sheet_hint = "スプレッドシート: 未設定（.env に URL または ID）"

    print("[todo-sheets] 設定チェック")
    print(f"  - {sheet_hint}")
    print(f"  - 認証 JSON: {cred_path} ({'あり' if cred_path.is_file() else 'なし'})")
    if email:
        print(f"  - シート共有先（編集者）: {email}")
    elif cred_path.is_file():
        print("  - client_email を credentials.json から読み取れませんでした")
    else:
        print("  - credentials.json を配置すると共有先メールが表示されます")
