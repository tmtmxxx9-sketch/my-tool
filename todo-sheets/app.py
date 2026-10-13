"""Flask + Google スプレッドシート ToDo Web アプリ"""

from __future__ import annotations

import os
from datetime import date

from flask import Flask, flash, redirect, render_template, request, url_for

import config  # noqa: F401 — .env を todo-sheets 基準で読み込む
from config import ensure_env_loaded, get_service_account_email
from line_notify import notify_todo
from sheets_store import DEFAULT_PRIORITY, create_todo, get_todo, list_todos, normalize_priority, update_todo
from todo_display import SORT_DUE, SORT_ID, SORT_PRIORITY, due_date_badge, sort_todos

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "dev-secret-change-me")


@app.before_request
def _ensure_todo_sheets_env():
    ensure_env_loaded()


@app.context_processor
def inject_sheet_setup():
    return {
        "service_account_email": get_service_account_email(),
        "today": date.today(),
    }


@app.template_filter("due_badge")
def due_badge_filter(due_raw: str) -> dict[str, str] | None:
    return due_date_badge(due_raw)


@app.route("/")
def index():
    sort = request.args.get("sort", SORT_ID)
    if sort not in (SORT_ID, SORT_DUE, SORT_PRIORITY):
        sort = SORT_ID
    try:
        todos = sort_todos(list_todos(), sort)
        error = None
    except Exception as exc:
        todos = []
        error = str(exc)
    return render_template(
        "index.html",
        todos=todos,
        error=error,
        sort=sort,
        sort_id=SORT_ID,
        sort_due=SORT_DUE,
        sort_priority=SORT_PRIORITY,
    )


def _render_edit_form(
    *,
    item,
    form_title: str,
    form_content: str,
    form_due_date: str,
    form_priority: str,
):
    return render_template(
        "edit.html",
        item=item,
        form_title=form_title,
        form_content=form_content,
        form_due_date=form_due_date,
        form_priority=form_priority,
    )


@app.route("/create", methods=["GET", "POST"])
def create():
    if request.method == "POST":
        title = request.form.get("title", "")
        content = request.form.get("content", "")
        due_date = request.form.get("due_date", "")
        priority = normalize_priority(request.form.get("priority", DEFAULT_PRIORITY))
        if not title.strip():
            flash("タイトルは必須です", "error")
            return _render_edit_form(
                item=None,
                form_title=title,
                form_content=content,
                form_due_date=due_date,
                form_priority=priority,
            )
        try:
            item = create_todo(title, content, due_date, priority)
            notify_todo(item.title, item.due_date, item.priority)
            flash("ToDo を登録しました", "success")
            return redirect(url_for("index"))
        except Exception as exc:
            flash(f"登録に失敗しました: {exc}", "error")
    return _render_edit_form(
        item=None,
        form_title="",
        form_content="",
        form_due_date="",
        form_priority=DEFAULT_PRIORITY,
    )


@app.route("/edit/<todo_id>", methods=["GET", "POST"])
def edit(todo_id: str):
    if request.method == "POST":
        title = request.form.get("title", "")
        content = request.form.get("content", "")
        due_date = request.form.get("due_date", "")
        priority = normalize_priority(request.form.get("priority", DEFAULT_PRIORITY))
        if not title.strip():
            flash("タイトルは必須です", "error")
            return _render_edit_form(
                item={"id": todo_id},
                form_title=title,
                form_content=content,
                form_due_date=due_date,
                form_priority=priority,
            )
        try:
            if update_todo(todo_id, title, content, due_date, priority):
                flash("ToDo を更新しました", "success")
                return redirect(url_for("index"))
            flash("対象の ToDo が見つかりません", "error")
        except Exception as exc:
            flash(f"更新に失敗しました: {exc}", "error")

    try:
        item = get_todo(todo_id)
    except Exception as exc:
        flash(str(exc), "error")
        return redirect(url_for("index"))
    if not item:
        flash("対象の ToDo が見つかりません", "error")
        return redirect(url_for("index"))
    return _render_edit_form(
        item=item,
        form_title=item.title,
        form_content=item.content,
        form_due_date=item.due_date,
        form_priority=item.priority,
    )


@app.route("/notify/<todo_id>", methods=["POST"])
def notify_line(todo_id: str):
    sort = request.args.get("sort", SORT_ID)
    try:
        item = get_todo(todo_id)
    except Exception as exc:
        flash(str(exc), "error")
        return redirect(url_for("index", sort=sort))
    if not item:
        flash("対象の ToDo が見つかりません", "error")
        return redirect(url_for("index", sort=sort))
    if notify_todo(item.title, item.due_date, item.priority, prefix="【ToDo通知】"):
        flash("LINE に通知しました", "success")
    else:
        flash("LINE は未設定のため通知をスキップしました（ログを確認）", "error")
    return redirect(url_for("index", sort=sort))


if __name__ == "__main__":
    from config import print_setup_status

    print_setup_status()
    if os.getenv("TODO_SHEETS_VERIFY_ON_START", "").strip() in ("1", "true", "yes"):
        from verify_sheets import main as verify_main

        verify_main()
    port = int(os.getenv("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=os.getenv("FLASK_DEBUG") == "1")
