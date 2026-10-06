"""credentials.json の client_email のみを標準出力（コピー用）"""

from __future__ import annotations

import sys

import config
from config import get_service_account_email, resolve_credentials_path


def main() -> None:
    path = resolve_credentials_path()
    if not path.is_file():
        print(f"error: not found: {path}", file=sys.stderr)
        sys.exit(1)
    email = get_service_account_email()
    if not email:
        print(f"error: client_email missing in {path}", file=sys.stderr)
        sys.exit(1)
    # 省略なし・改行のみ（パイプ / クリップボード向け）
    sys.stdout.write(email)
    sys.stdout.write("\n")
    sys.stdout.flush()


if __name__ == "__main__":
    main()
