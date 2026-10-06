"""credentials.json を Render 用 GOOGLE_CREDENTIALS_JSON（1行 JSON）として出力"""

from __future__ import annotations

import json
import sys

from config import get_service_account_json_raw, resolve_credentials_path

BEGIN = "----- ここからコピー（この行は含めない） -----"
END = "----- ここまでコピー（この行は含めない） -----"


def main() -> None:
    raw = get_service_account_json_raw()
    if raw:
        try:
            compact = json.dumps(json.loads(raw), separators=(",", ":"), ensure_ascii=False)
        except json.JSONDecodeError as exc:
            print(f"error: invalid JSON in environment variable: {exc}", file=sys.stderr)
            sys.exit(1)
    else:
        path = resolve_credentials_path()
        if not path.is_file():
            print(f"error: not found: {path}", file=sys.stderr)
            sys.exit(1)
        try:
            with path.open(encoding="utf-8") as f:
                data = json.load(f)
            compact = json.dumps(data, separators=(",", ":"), ensure_ascii=False)
        except (OSError, json.JSONDecodeError) as exc:
            print(f"error: cannot read {path}: {exc}", file=sys.stderr)
            sys.exit(1)

    print("", flush=True)
    print("【Render の貼り付け先】", flush=True)
    print("  場所: Web Service → Environment → Add Environment Variable", flush=True)
    print("  Key（名前）  : GOOGLE_CREDENTIALS_JSON", flush=True)
    print("  Value（値）  : 下の1行だけをコピー（BEGIN/END の行はコピーしない）", flush=True)
    print("", flush=True)
    print(BEGIN, flush=True)
    print(compact, flush=True)
    print(END, flush=True)
    print("", flush=True)
    print("※ GOOGLE_SERVICE_ACCOUNT_JSON ではなく GOOGLE_CREDENTIALS_JSON を使ってください。", flush=True)


if __name__ == "__main__":
    main()
