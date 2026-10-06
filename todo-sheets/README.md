# todo-sheets — Google スプレッドシート ToDo

Flask + gspread で ToDo を登録・編集し、Google スプレッドシートに同期します。

## ローカル開発

```powershell
cd todo-sheets
..\.venv\Scripts\pip install -r requirements.txt
copy .env.example .env
# credentials.json を todo-sheets に配置
..\.venv\Scripts\python.exe app.py
```

- 一覧: http://127.0.0.1:5000/
- 新規: http://127.0.0.1:5000/create

疎通: `python verify_sheets.py` / 共有先メール: `python print_client_email.py`

## Render へのデプロイ

### 1. リポジトリ連携

1. [Render](https://render.com/) → **New** → **Web Service** → GitHub リポジトリ `my-tool` を選択
2. **Root Directory** を `todo-sheets` に設定（必須）
3. **Runtime**: Python 3
4. **Build Command**: `pip install -r requirements.txt`
5. **Start Command**: `gunicorn app:app --bind 0.0.0.0:$PORT --timeout 120`  
   （`Procfile` / `render.yaml` と同じ）

### 2. 環境変数（Dashboard → Environment）

| 変数 | 必須 | 説明 |
|------|------|------|
| `GOOGLE_SHEETS_SPREADSHEET_URL` | ○ | スプレッドシート URL 全文 |
| `GOOGLE_SHEETS_WORKSHEET` | ○ | 例: `シート1` |
| `GOOGLE_CREDENTIALS_JSON` | ○ | サービスアカウント鍵 JSON を **1 行** で貼り付け（`type` / `private_key` / `client_email` を含む） |
| `FLASK_SECRET_KEY` | ○ | ランダムな長い文字列 |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | △ | URL の代わりに ID のみでも可 |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | △ | `GOOGLE_CREDENTIALS_JSON` の別名（どちらか一方） |

`GOOGLE_CREDENTIALS_JSON` は Render の Secret として登録してください。ファイル `credentials.json` は **Git に含めません**。

### 3. スプレッドシート共有

`GOOGLE_CREDENTIALS_JSON` 内の `client_email` をスプレッドシートの **編集者** に追加します。

### 4. 認証の優先順位

1. 環境変数 `GOOGLE_CREDENTIALS_JSON` または `GOOGLE_SERVICE_ACCOUNT_JSON`
2. ローカルの `credentials.json`（`GOOGLE_APPLICATION_CREDENTIALS` でパス変更可）

## ファイル

- `app.py` — Flask ルート
- `config.py` — `.env` / スプレッドシート ID / 認証
- `sheets_store.py` — gspread CRUD
- `requirements.txt` — `gunicorn` 含む
- `Procfile` / `render.yaml` — Render 起動定義
