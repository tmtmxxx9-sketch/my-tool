"""GOOGLE_CREDENTIALS_JSON 用の 1 行 JSON を Windows クリップボードへコピー"""

from __future__ import annotations

import json
import subprocess
import sys

from config import get_service_account_json_raw, resolve_credentials_path


def _compact_json_string() -> str:
    raw = get_service_account_json_raw()
    if raw:
        data = json.loads(raw)
    else:
        path = resolve_credentials_path()
        if not path.is_file():
            print(f"error: not found: {path}", file=sys.stderr)
            sys.exit(1)
        with path.open(encoding="utf-8") as f:
            data = json.load(f)
    return json.dumps(data, separators=(",", ":"), ensure_ascii=False)


def _set_clipboard(text: str) -> None:
    if sys.platform != "win32":
        print("error: clipboard copy is supported on Windows only", file=sys.stderr)
        sys.exit(1)
    # 改行・飾りなしの生 JSON のみ
    subprocess.run(
        ["powershell", "-NoProfile", "-Command", "Set-Clipboard -Value $env:COPY_JSON"],
        env={**dict(__import__("os").environ), "COPY_JSON": text},
        check=True,
    )


def main() -> None:
    payload = _compact_json_string()
    if not payload.startswith("{") or not payload.endswith("}"):
        print("error: invalid JSON shape", file=sys.stderr)
        sys.exit(1)
    _set_clipboard(payload)
    print(
        "クリップボードにコピーが完了しました。"
        "Render の Key=GOOGLE_CREDENTIALS_JSON の VALUE 欄で Ctrl+V を押してください。",
        flush=True,
    )


if __name__ == "__main__":
    main()
