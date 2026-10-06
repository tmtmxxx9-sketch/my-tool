"""Render 本番 URL の疎通・スプレッドシート接続エラー有無を検証"""

from __future__ import annotations

import html as html_lib
import re
import sys
import urllib.error
import urllib.request

DEFAULT_URL = "https://my-tool-swbz.onrender.com"

FAIL_MARKERS = (
    "スプレッドシートに接続できません",
    "Extra data",
    "GOOGLE_SHEETS_SPREADSHEET_ID が未設定",
    "サービスアカウント JSON が見つかりません",
    "登録に失敗しました",
)

ERROR_BOX_RE = re.compile(
    r'<strong>スプレッドシートに接続できません</strong>\s*<br\s*/>\s*([^<]+)',
    re.IGNORECASE | re.DOTALL,
)
FLASH_ERROR_RE = re.compile(
    r'class="flash error"[^>]*>([^<]+)',
    re.IGNORECASE,
)


def _fetch(url: str) -> tuple[int, str]:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "todo-sheets-verify-render/1.0"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            return resp.status, body
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        return exc.code, body


def _extract_error(html: str) -> str | None:
    for marker in FAIL_MARKERS:
        if marker in html:
            m = ERROR_BOX_RE.search(html)
            if m:
                return m.group(1).strip()
            m2 = FLASH_ERROR_RE.search(html)
            if m2:
                return m2.group(1).strip()
            return marker
    return None


def main() -> None:
    base = (sys.argv[1] if len(sys.argv) > 1 else DEFAULT_URL).rstrip("/")
    print(f"[verify_render] GET {base}/")
    status, body = _fetch(f"{base}/")

    if status != 200:
        print(f"[verify_render] 本番疎通テスト: 失敗 - HTTP {status}")
        sys.exit(1)

    err = _extract_error(body)
    if err:
        err = html_lib.unescape(err)
        print("[verify_render] 本番疎通テスト: 失敗")
        print(f"  検出メッセージ: {err}")
        if "Extra data" in err:
            print("  ヒント: GOOGLE_CREDENTIALS_JSON を1行だけ貼り直してください（66e100e 以降は末尾ゴミ耐性あり）")
        elif "404" in err:
            print("  ヒント: Render の GOOGLE_SHEETS_SPREADSHEET_URL が未設定・誤り、またはシート未共有の可能性")
        sys.exit(1)

    if "ToDo" not in body and "todo" not in body.lower():
        print("[verify_render] 本番疎通テスト: 警告 - HTTP 200 だが ToDo UI を確認できません")
        sys.exit(1)

    print("=== 本番稼働確認: 正常稼働中 ===")
    print(f"  URL: {base}/")
    print(f"  HTTP: {status}")


if __name__ == "__main__":
    main()
