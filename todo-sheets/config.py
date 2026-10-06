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
_SPREADSHEET_ID_IN_PATH = re.compile(r"/d/([a-zA-Z0-9-_]+)", re.IGNORECASE)
_GOOGLE_SHEET_ID_TOKEN = re.compile(r"[a-zA-Z0-9_-]{40,50}")
_CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f-\x9f\u200b-\u200d\ufeff]")


def sanitize_env_string(value: str) -> str:
    """改行・BOM・不可視制御文字を除去（Render 環境変数向け）。"""
    if not value:
        return ""
    cleaned = value.replace("\r", "").replace("\n", "")
    cleaned = _CONTROL_CHARS.sub("", cleaned)
    return cleaned.strip().strip('"').strip("'")


def normalize_spreadsheet_id_token(token: str) -> str | None:
    """英数字・ハイフン・アンダースコアのみの 40〜50 文字 ID に正規化。"""
    bare = re.sub(r"[^a-zA-Z0-9_-]", "", sanitize_env_string(token))
    if _GOOGLE_SHEET_ID_TOKEN.fullmatch(bare):
        return bare
    return None


def extract_spreadsheet_id(raw_target: str) -> str | None:
    """URL 全文・/d/XXX・ID 単体のいずれからも spreadsheet ID を抽出。"""
    target = sanitize_env_string(raw_target)
    if not target:
        return None

    for pattern in (_SPREADSHEET_ID_IN_PATH, _SPREADSHEET_ID_PATTERN):
        match = pattern.search(target)
        if match:
            normalized = normalize_spreadsheet_id_token(match.group(1))
            if normalized:
                return normalized

    normalized = normalize_spreadsheet_id_token(target)
    if normalized:
        return normalized

    fallback = _GOOGLE_SHEET_ID_TOKEN.search(target)
    if fallback:
        return fallback.group(0)

    return None


def _spreadsheet_env_candidates() -> list[str]:
    ensure_env_loaded()
    values: list[str] = []
    for key in ("GOOGLE_SHEETS_SPREADSHEET_ID", "GOOGLE_SHEETS_SPREADSHEET_URL"):
        value = sanitize_env_string(os.getenv(key, ""))
        if not value:
            value = sanitize_env_string(_read_env_file(key))
        if value:
            values.append(value)
    return values


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


def parse_service_account_json(raw_val: str) -> dict:
    """
    環境変数由来の JSON を 1 オブジェクトに正規化する。
    末尾の余分文字（Extra data）や前後のクォート混入に耐える。
    """
    raw = raw_val.strip()
    if not raw:
        raise ValueError("サービスアカウント JSON が空です")

    if (raw.startswith('"') and raw.endswith('"')) or (raw.startswith("'") and raw.endswith("'")):
        raw = raw[1:-1].strip()

    decoder = json.JSONDecoder()
    idx = raw.find("{")
    if idx == -1:
        info = json.loads(raw)
    else:
        info, _end = decoder.raw_decode(raw[idx:])
        if not isinstance(info, dict):
            raise ValueError("サービスアカウント JSON はオブジェクトである必要があります")

    if info.get("type") != "service_account" or not info.get("private_key"):
        raise ValueError("service_account 鍵 JSON の形式が正しくありません（type / private_key）")

    return info


def get_service_account_info() -> dict | None:
    """環境変数または credentials.json からサービスアカウント info dict を取得。"""
    raw_json = get_service_account_json_raw()
    if raw_json:
        return parse_service_account_json(raw_json)

    path = resolve_credentials_path()
    if not path.is_file():
        return None
    with path.open(encoding="utf-8") as f:
        info = json.load(f)
    if not isinstance(info, dict):
        raise ValueError(f"credentials.json の形式が不正です: {path}")
    return info


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


def get_spreadsheet_id_candidates() -> list[str]:
    """環境変数から抽出した spreadsheet ID（重複除去・出現順を維持）。"""
    seen: set[str] = set()
    ids: list[str] = []
    for raw in _spreadsheet_env_candidates():
        spreadsheet_id = extract_spreadsheet_id(raw)
        if spreadsheet_id and spreadsheet_id not in seen:
            seen.add(spreadsheet_id)
            ids.append(spreadsheet_id)
    return ids


def get_spreadsheet_id() -> str:
    ids = get_spreadsheet_id_candidates()
    if ids:
        return ids[0]

    raise ValueError(
        "GOOGLE_SHEETS_SPREADSHEET_ID が未設定です。"
        f" {ENV_FILE} または Render の Environment に "
        "GOOGLE_SHEETS_SPREADSHEET_ID / GOOGLE_SHEETS_SPREADSHEET_URL を設定してください。",
    )


def get_service_account_email() -> str | None:
    """環境変数 JSON または credentials.json から client_email を取得。"""
    try:
        info = get_service_account_info()
    except (OSError, json.JSONDecodeError, ValueError):
        return None
    if not info:
        return None
    email = info.get("client_email")
    return str(email).strip() if email else None


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
