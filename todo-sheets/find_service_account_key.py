"""Downloads / Desktop / Documents 配下からサービスアカウント鍵 JSON を探索して配置"""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

import config

APP_DIR = config.APP_DIR
DEST = APP_DIR / "credentials.json"

SEARCH_ROOTS = [
    Path.home() / "Downloads",
    Path.home() / "Desktop",
    Path.home() / "OneDrive" / "Desktop",
    Path.home() / "OneDrive" / "デスクトップ",
    Path.home() / "Documents",
    Path.home() / "OneDrive" / "Documents",
    Path.home() / "OneDrive" / "ドキュメント",
]


def is_service_account_key(path: Path) -> bool:
    try:
        if path.stat().st_size > 512_000:
            return False
        with path.open(encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            return False
        return data.get("type") == "service_account" and bool(data.get("private_key"))
    except (OSError, json.JSONDecodeError, UnicodeDecodeError):
        return False


def iter_json_files(root: Path):
    if not root.is_dir():
        return
    try:
        for path in root.rglob("*.json"):
            if path.resolve() == DEST.resolve():
                continue
            yield path
    except OSError:
        return


def find_key() -> Path | None:
    seen: set[Path] = set()
    for root in SEARCH_ROOTS:
        try:
            root = root.resolve()
        except OSError:
            continue
        if root in seen:
            continue
        seen.add(root)
        for path in iter_json_files(root):
            if is_service_account_key(path):
                return path
    return None


def main() -> None:
    found = find_key()
    if not found:
        print(
            "ローカルPC内に鍵ファイルが存在しません（Google Cloud Consoleからの再発行が必要です）",
            flush=True,
        )
        sys.exit(1)

    DEST.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(found, DEST)
    print(f"鍵ファイルを自動配置しました: {found}", flush=True)
    sys.exit(0)


if __name__ == "__main__":
    main()
