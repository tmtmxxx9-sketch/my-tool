const VISION_ANNOTATE_URL =
  "https://vision.googleapis.com/v1/images:annotate";

type VisionErrorBody = {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    details?: unknown[];
  };
};

type VisionAnnotateResponse = {
  responses?: Array<{
    fullTextAnnotation?: { text?: string };
    textAnnotations?: Array<{ description?: string }>;
    error?: VisionErrorBody["error"];
  }>;
  error?: VisionErrorBody["error"];
};

export class VisionApiError extends Error {
  httpStatus: number;
  body?: VisionErrorBody;

  constructor(message: string, httpStatus: number, body?: VisionErrorBody) {
    super(message);
    this.name = "VisionApiError";
    this.httpStatus = httpStatus;
    this.body = body;
  }
}

export function resolveGoogleVisionApiKey(): string | undefined {
  return process.env.GOOGLE_VISION_API_KEY?.trim();
}

export function validateGoogleVisionApiKey(apiKey: string): string | null {
  if (apiKey.startsWith("AQ.")) {
    return "GEMINI_API_KEY ではなく、Google Cloud Console で作成した Cloud Vision API 用の GOOGLE_VISION_API_KEY を設定してください。";
  }

  if (!apiKey.startsWith("AIza")) {
    return "GOOGLE_VISION_API_KEY の形式が正しくありません。Google Cloud Console の API キー（AIza で始まる）を設定してください。";
  }

  return null;
}

export function mapVisionApiErrorMessage(message: string): string {
  const normalized = message.toLowerCase();

  if (normalized.includes("api keys are not supported by this api")) {
    return "Cloud Vision API 用の API キーが必要です。Google Cloud Console で Cloud Vision API を有効化し、GOOGLE_VISION_API_KEY にその API キーを設定してください。";
  }

  if (
    normalized.includes("api key not valid") ||
    normalized.includes("invalid api key")
  ) {
    return "GOOGLE_VISION_API_KEY が無効です。Google Cloud Console の API キーを確認してください。";
  }

  if (
    normalized.includes("has not been used") ||
    normalized.includes("is disabled") ||
    normalized.includes("access not configured")
  ) {
    return "Cloud Vision API が有効化されていません。Google Cloud Console で Cloud Vision API を有効にしてください。";
  }

  return message || "Vision API エラー";
}

/**
 * Cloud Vision REST API (images:annotate) を fetch で呼び出す。
 * @see https://cloud.google.com/vision/docs/reference/rest/v1/images/annotate
 */
export async function annotateReceiptImage(input: {
  apiKey: string;
  imageBase64: string;
}): Promise<string> {
  const response = await fetch(VISION_ANNOTATE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": input.apiKey,
    },
    body: JSON.stringify({
      requests: [
        {
          image: { content: input.imageBase64 },
          features: [{ type: "DOCUMENT_TEXT_DETECTION", maxResults: 1 }],
        },
      ],
    }),
  });

  const body = (await response.json()) as VisionAnnotateResponse;

  if (!response.ok || body.error) {
    const message = mapVisionApiErrorMessage(
      body.error?.message ?? "Vision API エラー",
    );
    throw new VisionApiError(message, response.status, body);
  }

  const firstResponse = body.responses?.[0];
  if (firstResponse?.error) {
    const message = mapVisionApiErrorMessage(
      firstResponse.error.message ?? "Vision API エラー",
    );
    throw new VisionApiError(message, response.status, {
      error: firstResponse.error,
    });
  }

  return (
    firstResponse?.fullTextAnnotation?.text?.trim() ??
    firstResponse?.textAnnotations?.[0]?.description?.trim() ??
    ""
  );
}
