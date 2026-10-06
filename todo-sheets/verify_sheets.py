"""Google スプレッドシート接続・権限の疎通テスト（CLI）"""

from __future__ import annotations

import sys

import gspread
from google.auth.exceptions import GoogleAuthError

import config
from config import get_service_account_email, get_spreadsheet_id, print_setup_status, resolve_credentials_path
from sheets_store import HEADERS, create_todo, list_todos


def _log(msg: str) -> None:
    print(msg, flush=True)


def _fail(reason: str, code: int = 1) -> None:
    _log(f"[todo-sheets] 疎通テスト: 失敗 - {reason}")
    sys.exit(code)


def verify_credentials_file() -> str:
    path = resolve_credentials_path()
    if not path.is_file():
        _fail(
            f"秘密鍵が未配置です: {path}\n"
            "  GCP からダウンロードした JSON を todo-sheets/credentials.json に置いてください。",
        )
    email = get_service_account_email()
    if not email:
        _fail(f"credentials.json から client_email を読み取れません: {path}")
    _log(f"[todo-sheets] 共有先メールアドレス（編集者で共有）: {email}")
    return email


def verify_spreadsheet_access() -> None:
    try:
        get_spreadsheet_id()
    except ValueError as exc:
        _fail(str(exc))

    try:
        todos = list_todos()
    except FileNotFoundError as exc:
        _fail(str(exc))
    except gspread.exceptions.APIError as exc:
        status = getattr(getattr(exc, "response", None), "status_code", None)
        if status == 403:
            email = get_service_account_email() or "(client_email 不明)"
            _fail(
                f"403 権限不足 - スプレッドシートをサービスアカウントに「編集者」で共有してください。\n"
                f"  共有先: {email}",
            )
        if status == 404:
            _fail("404 - スプレッドシート ID が無効か、存在しません。.env の URL を確認してください。")
        _fail(f"Google Sheets API エラー (HTTP {status}): {exc}")
    except GoogleAuthError as exc:
        _fail(f"認証エラー - credentials.json が無効または期限切れの可能性: {exc}")
    except Exception as exc:
        _fail(f"接続エラー: {type(exc).__name__}: {exc}")

    _log(f"[todo-sheets] 読み取り OK - 既存 ToDo {len(todos)} 件")
    _log(f"[todo-sheets] 1 行目ヘッダー想定: {', '.join(HEADERS)}（未設定時は list_todos 内で自動作成済み）")


def verify_write() -> None:
    try:
        item = create_todo("疎通テスト", "verify_sheets.py による自動確認", "")
    except gspread.exceptions.APIError as exc:
        status = getattr(getattr(exc, "response", None), "status_code", None)
        if status == 403:
            email = get_service_account_email() or "(client_email 不明)"
            _fail(f"403 - 書き込み権限がありません。共有先: {email}")
        _fail(f"書き込み API エラー (HTTP {status}): {exc}")
    except Exception as exc:
        _fail(f"書き込み失敗: {type(exc).__name__}: {exc}")

    _log(f"[todo-sheets] 書き込み OK - テスト行 ID={item.id} を追加しました（シート上で削除して構いません）")


def main() -> None:
    _log("[todo-sheets] === 疎通テスト開始 ===")
    print_setup_status()
    verify_credentials_file()
    verify_spreadsheet_access()
    verify_write()
    _log("[todo-sheets] === 疎通テスト: すべて成功 ===")


if __name__ == "__main__":
    main()
