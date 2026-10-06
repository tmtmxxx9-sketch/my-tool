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

疎通: `python verify_sheets.py` / 本番: `python verify_render.py`  
共有先メール: `python print_client_email.py`  
Render 用 1 行 JSON: `python print_credentials_env.py`（画面確認用）  
**クリップボードへ直接コピー（推奨）:** `python copy_credentials_to_clipboard.py` → Render の `GOOGLE_CREDENTIALS_JSON` に Ctrl+V

## Render へのデプロイ

### JSON の鍵は「どこに」貼る？

**結論: 環境変数の名前（Key）を `GOOGLE_CREDENTIALS_JSON` にして、値（Value）に 1 行 JSON を貼る。**

| Render の入力欄 | 入れるもの |
|----------------|------------|
| **Key（Variable Name）** | `GOOGLE_CREDENTIALS_JSON` ← **この名前をそのまま** |
| **Value（Variable Value）** | ターミナルで `python print_credentials_env.py` を実行し、**「ここからコピー」と「ここまでコピー」の間の 1 行だけ** |

貼ってはいけないもの:

- `----- ここからコピー -----` などの **区切り行そのもの**
- 改行を入れた **複数行の JSON ファイル**（Render では 1 行にまとめる）
- 別の Key 名（例: `credentials.json` という名前の変数は **使わない**）

同じ JSON を `GOOGLE_SERVICE_ACCOUNT_JSON` に貼っても動きますが、**迷ったら `GOOGLE_CREDENTIALS_JSON` だけ**で OK です。

### 1. リポジトリ連携

1. [Render](https://render.com/) → **New** → **Web Service** → GitHub リポジトリ `my-tool` を選択
2. **Root Directory** を `todo-sheets` に設定（必須）
3. **Runtime**: Python 3
4. **Build Command**: `pip install -r requirements.txt`
5. **Start Command**: `gunicorn app:app --bind 0.0.0.0:$PORT --timeout 120`  
   （`Procfile` / `render.yaml` と同じ）

### 2. 環境変数（Dashboard → Environment）

最低限、次の **4 つ** を追加します。

| Key（名前） | Value（値）の例 |
|-------------|-----------------|
| `GOOGLE_CREDENTIALS_JSON` | `print_credentials_env.py` の **1 行 JSON**（秘密鍵） |
| `GOOGLE_SHEETS_SPREADSHEET_URL` | `https://docs.google.com/spreadsheets/d/xxxxx/edit` |
| `GOOGLE_SHEETS_WORKSHEET` | `シート1` |
| `FLASK_SECRET_KEY` | 適当な長いランダム文字列 |

`GOOGLE_CREDENTIALS_JSON` は **Secret**（鍵マーク）にすると安全です。`credentials.json` ファイル自体は Render にアップロードしません。

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
