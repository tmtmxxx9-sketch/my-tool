"""Flask + Google スプレッドシート ToDo Web アプリ"""

from __future__ import annotations

import os

from flask import Flask, flash, redirect, render_template, request, url_for

import config  # noqa: F401 — .env を todo-sheets 基準で読み込む
from sheets_store import create_todo, get_todo, list_todos, update_todo

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "dev-secret-change-me")


@app.route("/")
def index():
    try:
        todos = list_todos()
        error = None
    except Exception as exc:
        todos = []
        error = str(exc)
    return render_template("index.html", todos=todos, error=error)


@app.route("/create", methods=["GET", "POST"])
def create():
    if request.method == "POST":
        title = request.form.get("title", "")
        content = request.form.get("content", "")
        due_date = request.form.get("due_date", "")
        if not title.strip():
            flash("タイトルは必須です", "error")
            return render_template("edit.html", item=None, form_title=title, form_content=content, form_due_date=due_date)
        try:
            create_todo(title, content, due_date)
            flash("ToDo を登録しました", "success")
            return redirect(url_for("index"))
        except Exception as exc:
            flash(f"登録に失敗しました: {exc}", "error")
    return render_template("edit.html", item=None, form_title="", form_content="", form_due_date="")


@app.route("/edit/<todo_id>", methods=["GET", "POST"])
def edit(todo_id: str):
    if request.method == "POST":
        title = request.form.get("title", "")
        content = request.form.get("content", "")
        due_date = request.form.get("due_date", "")
        if not title.strip():
            flash("タイトルは必須です", "error")
            return render_template(
                "edit.html",
                item={"id": todo_id},
                form_title=title,
                form_content=content,
                form_due_date=due_date,
            )
        try:
            if update_todo(todo_id, title, content, due_date):
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
    return render_template(
        "edit.html",
        item=item,
        form_title=item.title,
        form_content=item.content,
        form_due_date=item.due_date,
    )


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=os.getenv("FLASK_DEBUG") == "1")
