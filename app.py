import io
import os

import streamlit as st
from dotenv import load_dotenv
from google import genai
from google.genai import types
from PIL import Image

load_dotenv()

MODEL_NAME = "gemini-2.5-flash"
API_KEY_NAME = "GEMINI_API_KEY"
PLACEHOLDER_KEYS = {"your_api_key_here", "your-api-key-here", "changeme"}

RECIPE_PROMPT = """あなたは栄養に詳しい家庭料理アドバイザーです。
提示された食材をもとに、以下3区分のレシピを日本語で考案してください。

1. 糖質制限レシピ（ローカーボ）
2. 脂質制限レシピ（ローファット）
3. バランスレシピ（PFC安定型）

各レシピには必ず次の項目を含めてください。
- 料理名
- 狙い・ポイント
- 推定カロリー/栄養指標（P・F・Cの目安も）
- 調理時間
- 材料（1〜2人分）
- 作り方ステップ（番号付き）

出力ルール:
- Markdownの表（table）は絶対に使わない
- 見出し（## / ###）と箇条書き・番号リストだけで読みやすく整形する
- スマホで読みやすい短い段落にする
- 各区分は ## 見出しで区切る
- 材料と手順は箇条書きまたは番号リストにする

{extra_request}
"""


def _secret_api_key() -> str:
    """Streamlit Secrets からキーを読む。

    secrets.toml が存在しないローカル環境では
    st.secrets へのアクセス自体が例外を投げるため、ここで吸収する。
    """
    try:
        return str(st.secrets[API_KEY_NAME])
    except Exception:
        return ""


def resolve_api_key() -> str:
    """Streamlit Secrets → 環境変数(.env) の順で API キーを解決する。"""
    for candidate in (_secret_api_key(), os.getenv(API_KEY_NAME, "")):
        key = candidate.strip()
        if key and key not in PLACEHOLDER_KEYS:
            return key
    return ""


def get_client() -> genai.Client:
    api_key = resolve_api_key()
    if not api_key:
        raise ValueError(
            f"{API_KEY_NAME} が見つかりません。"
            "ローカルでは .env、Streamlit Cloud では Secrets に設定してください。"
            "キーは Google AI Studio で取得できます。"
        )
    return genai.Client(api_key=api_key)


def image_to_part(image: Image.Image) -> types.Part:
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG")
    return types.Part.from_bytes(data=buffer.getvalue(), mime_type="image/jpeg")


def build_prompt(extra_request: str) -> str:
    extra = ""
    if extra_request.strip():
        extra = f"追加リクエスト: {extra_request.strip()}\n上記条件も必ず反映してください。"
    return RECIPE_PROMPT.format(extra_request=extra)


def generate_from_image(image: Image.Image, extra_request: str) -> str:
    client = get_client()
    prompt = (
        build_prompt(extra_request)
        + "\n\nまず画像から見える食材を特定し、その食材だけを使って3区分のレシピを出力してください。"
    )
    response = client.models.generate_content(
        model=MODEL_NAME,
        contents=[image_to_part(image), prompt],
    )
    return response.text or "レシピを生成できませんでした。"


def generate_from_text(ingredients: str, extra_request: str) -> str:
    client = get_client()
    prompt = (
        build_prompt(extra_request)
        + f"\n\n使用する食材:\n{ingredients.strip()}\n"
        "上記の食材を中心に3区分のレシピを出力してください。"
    )
    response = client.models.generate_content(
        model=MODEL_NAME,
        contents=[prompt],
    )
    return response.text or "レシピを生成できませんでした。"


def render_mobile_styles() -> None:
    st.markdown(
        """
        <style>
        .main .block-container {
            padding-top: 1.5rem;
            padding-bottom: 2rem;
            max-width: 720px;
        }
        h1 {
            font-size: 1.6rem;
            line-height: 1.3;
        }
        h2, h3 {
            line-height: 1.35;
        }
        </style>
        """,
        unsafe_allow_html=True,
    )


def main() -> None:
    st.set_page_config(
        page_title="食材スキャン ダイエットレシピ",
        page_icon="🥗",
        layout="centered",
    )
    render_mobile_styles()

    st.title("🥗 食材スキャン ダイエットレシピ")
    st.caption("冷蔵庫の食材から、糖質制限・脂質制限・バランスの3パターンを提案します。")

    extra_request = st.text_input(
        "任意リクエスト（例: 10分以内、レンジのみ、辛くしない）",
        placeholder="10分以内で作りたい / レンジのみ / 子ども向け",
    )

    input_tab_image, input_tab_text = st.tabs(["📷 画像で入力", "✏️ テキスト入力（食材名）"])

    image_input = None
    ingredients_text = ""

    with input_tab_image:
        image_mode = st.radio(
            "入力方法",
            ["カメラで撮影", "画像アップロード"],
            horizontal=True,
            label_visibility="collapsed",
        )
        if image_mode == "カメラで撮影":
            image_input = st.camera_input("食材を撮影")
        else:
            image_input = st.file_uploader(
                "食材の写真をアップロード",
                type=["jpg", "jpeg", "png", "webp"],
            )

    with input_tab_text:
        ingredients_text = st.text_area(
            "食材名を入力（カンマまたは改行区切り）",
            placeholder="鶏むね肉\nブロッコリー\n卵\n豆腐",
            height=120,
        )

    generate_clicked = st.button("レシピを考える", type="primary", use_container_width=True)

    if generate_clicked:
        try:
            with st.spinner("レシピを考案中..."):
                if image_input is not None:
                    image = Image.open(image_input).convert("RGB")
                    st.image(image, caption="入力画像", use_container_width=True)
                    result = generate_from_image(image, extra_request)
                elif ingredients_text.strip():
                    result = generate_from_text(ingredients_text, extra_request)
                else:
                    st.warning("画像を撮影・アップロードするか、食材名を入力してください。")
                    return

            st.success("レシピができました！")
            st.markdown(result)
        except ValueError as exc:
            st.error(str(exc))
        except Exception as exc:
            st.error(f"エラーが発生しました: {exc}")


if __name__ == "__main__":
    main()
