import { ApiError, GoogleGenAI } from "@google/genai";

export type GeminiOcrResult = {
  name: string;
  expirationDate: string | null;
  category: "食材" | "調味料" | "日用品";
};

export const OCR_MODEL = "gemini-3.6-flash";

const OCR_SYSTEM_PROMPT = `あなたは日本の食品・日用品パッケージを読み取るアシスタントです。
画像から商品情報を抽出し、指定のJSONスキーマどおりに返してください。

ルール:
- name: 一般的な商品名（例: 豆乳、無調整豆乳、醤油）。キャッチコピー、メーカー名、説明文、栄養成分表、バーコード番号は除外
- expirationDate: 賞味期限または消費期限を YYYY-MM-DD 形式で返す。見つからなければ null
  - 「2027年1月3日」「2027.01.03」「27.1.3」「27. 1. 3」「27/1/3」など印字形式を解釈する
  - 2桁年（例: 27）は 2027 年など、食品包装として現実的な未来の年に推論する
  - 年が判別できない、または日付として不自然な場合は null
- category: 「食材」「調味料」「日用品」のいずれか1つ

出力例:
{"name":"無調整豆乳","expirationDate":"2027-01-03","category":"食材"}`;

const OCR_RESPONSE_JSON_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" },
    expirationDate: { type: ["string", "null"] },
    category: {
      type: "string",
      enum: ["食材", "調味料", "日用品"],
    },
  },
  required: ["name", "expirationDate", "category"],
} as const;

function normalizeCategory(value: unknown): GeminiOcrResult["category"] {
  if (value === "食材" || value === "調味料" || value === "日用品") {
    return value;
  }
  return "食材";
}

function normalizeExpirationDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const text = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return null;
  }
  const [year, month, day] = text.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return text;
}

function normalizeName(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

export function parseGeminiOcrJson(rawText: string): GeminiOcrResult {
  const parsed = JSON.parse(rawText) as {
    name?: unknown;
    expirationDate?: unknown;
    category?: unknown;
  };

  return {
    name: normalizeName(parsed.name),
    expirationDate: normalizeExpirationDate(parsed.expirationDate),
    category: normalizeCategory(parsed.category),
  };
}

function extractErrorMessage(error: unknown): string {
  const rawMessage =
    error instanceof ApiError || error instanceof Error
      ? error.message
      : "Gemini API エラー";

  try {
    const parsed = JSON.parse(rawMessage) as {
      error?: { message?: string };
    };
    if (parsed.error?.message) {
      return parsed.error.message;
    }
  } catch {
    // Keep the original message when it is not JSON.
  }

  return rawMessage;
}

export async function analyzeProductImageWithGemini(input: {
  apiKey: string;
  imageBase64: string;
  mimeType: string;
}): Promise<GeminiOcrResult> {
  const ai = new GoogleGenAI({ apiKey: input.apiKey });

  try {
    const response = await ai.models.generateContent({
      model: OCR_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { text: OCR_SYSTEM_PROMPT },
            {
              inlineData: {
                mimeType: input.mimeType,
                data: input.imageBase64,
              },
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: OCR_RESPONSE_JSON_SCHEMA,
      },
    });

    const rawText = response.text;
    if (!rawText) {
      throw new Error("Gemini から応答がありませんでした");
    }

    return parseGeminiOcrJson(rawText);
  } catch (error) {
    throw new Error(extractErrorMessage(error));
  }
}
