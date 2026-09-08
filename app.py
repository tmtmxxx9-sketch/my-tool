import os

import streamlit as st
import truststore
from dotenv import load_dotenv
from google import genai
from PIL import Image

# Norton などの HTTPS スキャンは TLS を再署名するため、そのルート CA は
# Windows 証明書ストアにしか存在しない。httpx 既定の certifi バンドルでは
# 検証に失敗するため、OS のトラストストアを使うよう差し替える。
truststore.inject_into_ssl()

load_dotenv()

MODEL_NAME = "gemini-3.6-flash"
API_KEY_NAME = "GEMINI_API_KEY"
PLACEHOLDER_KEYS = {"your_api_key_here", "your-api-key-here", "changeme"}

# ページ設定（スマホ最適化）
st.set_page_config(
    page_title="食材スキャン ダイエットレシピ",
    page_icon="🥗",
    layout="centered",
    initial_sidebar_state="collapsed",
)

# モバイル視認性向上のCSS
st.markdown(
    """
<style>
    .stButton>button {
        width: 100%;
        border-radius: 8px;
        height: 3.2em;
        background-color: #2E7D32;
        color: white;
        font-weight: bold;
        font-size: 16px;
    }
    .stTextInput>div>div>input, .stTextArea>div>div>textarea {
        font-size: 16px;
    }
</style>
""",
    unsafe_allow_html=True,
)

st.title("🥗 食材からつくるダイエットレシピ")
st.caption("写真を撮るか食材名を入れるだけで、3つのダイエット指針に沿ったメニューを提案します。")


def normalize_api_key(value: str | None) -> str | None:
    if not value:
        return None
    key = value.strip()
    if not key or key in PLACEHOLDER_KEYS:
        return None
    return key


# Streamlit Secrets（クラウド公開時）または .env / 環境変数から取得
api_key: str | None = None
try:
    if API_KEY_NAME in st.secrets:
        api_key = normalize_api_key(str(st.secrets[API_KEY_NAME]))
except Exception:
    pass

if not api_key:
    api_key = normalize_api_key(os.environ.get(API_KEY_NAME))

# いずれにも存在しない場合のみ画面に入力フォームを表示
if not api_key:
    with st.expander("⚙️ APIキー設定（初回のみ）", expanded=False):
        api_key = normalize_api_key(
            st.text_input("Gemini API Key を入力してください", type="password")
        )

# 入力セクション
upload_tab, text_tab = st.tabs(["📸 写真で入力", "✏️ 文字だけで入力"])

image_input = None
image_supplement_text = ""

with upload_tab:
    camera_file = st.camera_input("カメラで撮影")
    upload_file = st.file_uploader("またはアルバムから選択", type=["jpg", "jpeg", "png"])
    target_file = camera_file if camera_file else upload_file
    if target_file:
        image_input = Image.open(target_file).convert("RGB")
        st.image(image_input, caption="読み込んだ写真", use_container_width=True)
        image_supplement_text = st.text_input(
            "写真の補足・追加食材（任意）",
            placeholder="例：ピーマンと長ネギ、あと冷蔵庫に豆腐もあります",
        )

text_only_input = ""
with text_tab:
    text_only_input = st.text_area(
        "冷蔵庫にある食材を教えてください",
        placeholder="例：鶏むね肉、キャベツ、卵、豆腐",
    )

# 追加条件
sub_cond = st.text_input("追加のリクエスト（任意）", placeholder="例：レンジだけで作りたい、辛いもの")

generate_btn = st.button("レシピを提案してもらう！")

if generate_btn:
    if not api_key:
        st.error("Gemini APIキーが設定されていません。")
    elif not image_input and not text_only_input.strip() and not image_supplement_text.strip():
        st.warning("食材の写真、または食材の名前を入力してください。")
    else:
        with st.spinner("食材を精密分析し、3大ダイエットレシピを作成中..."):
            try:
                client = genai.Client(api_key=api_key)

                prompt = f"""
あなたはプロの管理栄養士です。
提示された食材情報（画像・テキスト）から、スマホで一瞬で読める3大ダイエットレシピを考案してください。

【重要：食材の認識ルール】
- 画像の特徴から食材を推論してください。
- 補足テキストの入力がある場合は最優先で採用してください。
- 認識した食材名を冒頭に短く列挙してください。

【追加リクエスト】
{sub_cond if sub_cond else "特になし"}

【出力構成の絶対ルール】
- 表（Table）は絶対に使わないこと。
- 「PFC」等の英字表記は禁止。「タンパク質」「脂質」「炭水化物」の日本語のみ。
- 説明文や長い文章は禁止。全て「短文の箇条書き」で目滑りを防ぐこと。
- 材料は「品名: 分量」のみ。
- 作り方は「1行30文字以内」「最大3ステップ」で簡潔に記述すること。
- 以下の形式を厳密に守ること。

---
【認識した食材】: ○○、○○

### 1. 糖質制限（ローカーボ）
* **料理名**: 
* **狙い**: （1行で簡潔に）
* **推定栄養素**:
  - カロリー: 約○○kcal
  - タンパク質: 約○○g
  - 脂質: 約○○g
  - 炭水化物: 約○○g
* **材料**:
  - 食材A: ○○
  - 調味料B: ○○
* **作り方**:
  1. ○○を切る
  2. フライパンで○○を炒める
  3. 調味料を加えて完成

### 2. 脂質制限（ローファット）
* **料理名**: 
* **狙い**: （1行で簡潔に）
* **推定栄養素**:
  - カロリー: 約○○kcal
  - タンパク質: 約○○g
  - 脂質: 約○○g
  - 炭水化物: 約○○g
* **材料**:
  - 食材A: ○○
  - 調味料B: ○○
* **作り方**:
  1. ○○と調味料を耐熱容器に入れる
  2. レンジで○分加熱する
  3. 軽く和えて完成

### 3. バランス（PFC安定）
* **料理名**: 
* **狙い**: （1行で簡潔に）
* **推定栄養素**:
  - カロリー: 約○○kcal
  - タンパク質: 約○○g
  - 脂質: 約○○g
  - 炭水化物: 約○○g
* **材料**:
  - 食材A: ○○
  - 調味料B: ○○
* **作り方**:
  1. ○○を一口大に切る
  2. ○○を弱火で蒸し焼きにする
  3. 盛り付けて完成
---
"""

                contents = [prompt]
                if image_input:
                    contents.append(image_input)
                if image_supplement_text.strip():
                    contents.append(
                        f"【ユーザーからの写真補足・追加食材】: {image_supplement_text.strip()}"
                    )
                if text_only_input.strip():
                    contents.append(f"【食材テキスト情報】: {text_only_input.strip()}")

                response = client.models.generate_content(
                    model=MODEL_NAME,
                    contents=contents,
                )

                st.success("レシピが完成しました！")
                st.markdown(response.text)

            except Exception as e:
                st.error(f"エラーが発生しました: {str(e)}")
