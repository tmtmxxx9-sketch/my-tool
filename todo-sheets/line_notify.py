"""LINE 通知（トークン未設定時はログのみで継続）"""

from __future__ import annotations

import os
import sys

import requests

from config import ensure_env_loaded


def _log(msg: str) -> None:
    print(f"[LINE] {msg}", file=sys.stderr, flush=True)


def format_todo_message(title: str, due_date: str, priority: str, prefix: str = "【ToDo登録】") -> str:
    due = due_date.strip() if due_date else "未設定"
    pri = priority.strip() if priority else "中"
    return f"{prefix}タイトル: {title} / 期日: {due} / 重要度: {pri}"


def send_line_message(message: str) -> bool:
    """Notify API または Messaging API で送信。未設定なら False（例外なし）。"""
    ensure_env_loaded()
    notify_token = os.getenv("LINE_NOTIFY_TOKEN", "").strip()
    if notify_token:
        try:
            resp = requests.post(
                "https://notify-api.line.me/api/notify",
                headers={"Authorization": f"Bearer {notify_token}"},
                data={"message": message},
                timeout=15,
            )
            if resp.ok:
                return True
            _log(f"Notify API 失敗: HTTP {resp.status_code} {resp.text[:200]}")
        except requests.RequestException as exc:
            _log(f"Notify API エラー: {exc}")
        return False

    access_token = os.getenv("LINE_CHANNEL_ACCESS_TOKEN", "").strip()
    user_id = os.getenv("LINE_PUSH_USER_ID", "").strip()
    if access_token and user_id:
        try:
            resp = requests.post(
                "https://api.line.me/v2/bot/message/push",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json",
                },
                json={"to": user_id, "messages": [{"type": "text", "text": message}]},
                timeout=15,
            )
            if resp.ok:
                return True
            _log(f"Messaging API 失敗: HTTP {resp.status_code} {resp.text[:200]}")
        except requests.RequestException as exc:
            _log(f"Messaging API エラー: {exc}")
        return False

    _log("スキップ: LINE_NOTIFY_TOKEN または LINE_CHANNEL_ACCESS_TOKEN + LINE_PUSH_USER_ID 未設定")
    return False


def notify_todo(title: str, due_date: str, priority: str, *, prefix: str = "【ToDo登録】") -> bool:
    return send_line_message(format_todo_message(title, due_date, priority, prefix=prefix))
