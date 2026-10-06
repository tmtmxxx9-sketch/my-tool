"""todo-sheets 用環境変数の読み込み（アプリ配置ディレクトリ基準）"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

from dotenv import load_dotenv


def _configure_ssl_ca_bundle() -> None:
    """Windows 等で oauth2.googleapis.com 等の TLS 検証失敗を防ぐ。"""
    try:
        import truststore

        truststore.inject_into_ssl()
        return
    except ImportError:
        pass
    if os.environ.get("SSL_CERT_FILE"):
        return
    try:
        import certifi

        ca = certifi.where()
        os.environ["SSL_CERT_FILE"] = ca
        os.environ["REQUESTS_CA_BUNDLE"] = ca
    except ImportError:
        pass


_configure_ssl_ca_bundle()

APP_DIR = Path(__file__).resolve().parent

ENV_FILE = APP_DIR / ".env"


def ensure_env_loaded() -> None:
    """リクエストごとにも todo-sheets/.env を確実に反映（空の OS 環境変数より .env を優先）。"""
    load_dotenv(APP_DIR.parent / ".env")
    load_dotenv(ENV_FILE, override=True)


ensure_env_loaded()

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


def get_service_account_json_raw() -> str:
    """本番: GOOGLE_CREDENTIALS_JSON 等。ローカル: 空なら credentials.json を使用。"""
    ensure_env_loaded()
    for key in ("GOOGLE_SERVICE_ACCOUNT_JSON", "GOOGLE_CREDENTIALS_JSON"):
        value = os.getenv(key, "").strip()
        if value:
            return value
    return ""


def _read_env_file(key: str) -> str:
    """dotenv が OS の空値で上書きできない場合のフォールバック。"""
    if not ENV_FILE.is_file():
        return ""
    try:
        text = ENV_FILE.read_text(encoding="utf-8")
    except OSError:
        return ""
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        name, _, value = stripped.partition("=")
        if name.strip() == key:
            return value.strip().strip('"').strip("'")
    return ""


def get_spreadsheet_id() -> str:
    ensure_env_loaded()

    direct = os.getenv("GOOGLE_SHEETS_SPREADSHEET_ID", "").strip()
    if not direct:
        direct = _read_env_file("GOOGLE_SHEETS_SPREADSHEET_ID").strip()
    if direct:
        return direct

    url = os.getenv("GOOGLE_SHEETS_SPREADSHEET_URL", "").strip()
    if not url:
        url = _read_env_file("GOOGLE_SHEETS_SPREADSHEET_URL").strip()
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
        f" {ENV_FILE} に ID または GOOGLE_SHEETS_SPREADSHEET_URL を設定し、"
        " credentials.json を todo-sheets フォルダに置いてください。",
    )


def get_service_account_email() -> str | None:
    """環境変数 JSON または credentials.json から client_email を取得。"""
    raw_json = get_service_account_json_raw()
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
    env_json = bool(get_service_account_json_raw())
    if env_json:
        print("  - 認証: 環境変数 GOOGLE_CREDENTIALS_JSON / GOOGLE_SERVICE_ACCOUNT_JSON")
    else:
        print(f"  - 認証 JSON: {cred_path} ({'あり' if cred_path.is_file() else 'なし'})")
    if email:
        print(f"  - シート共有先（編集者）: {email}")
    elif env_json or cred_path.is_file():
        print("  - client_email を認証情報から読み取れませんでした")
    else:
        print(
            "  - ローカル: credentials.json / 本番: GOOGLE_CREDENTIALS_JSON を設定してください",
        )
