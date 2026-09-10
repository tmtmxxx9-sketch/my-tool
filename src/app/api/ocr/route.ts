import { NextResponse } from "next/server";

export const runtime = "nodejs";

const VISION_ENDPOINT = "https://vision.googleapis.com/v1/images:annotate";

const SUPPORTED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

const MIN_IMAGE_BYTES = 1024;

type ImagePayload = {
  base64: string;
  mimeType: string;
  byteLength: number;
};

export type ReceiptItem = {
  name: string;
  price?: number;
};

type ReceiptParseResult = {
  items: ReceiptItem[];
};

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

const RECEIPT_NOISE_KEYWORDS = [
  "合計",
  "小計",
  "お預かり",
  "お預り",
  "預り",
  "お釣り",
  "おつり",
  "釣銭",
  "クレジット",
  "ポイント",
  "外税",
  "内税",
  "税込",
  "税抜",
  "消費税",
  "税率",
  "登録番号",
  "インボイス",
  "領収",
  "ありがとう",
  "レジ",
  "会計",
  "商品点数",
  "買上",
  "買上点数",
  "電話",
  "tel",
  "fax",
  "住所",
  "店舗",
  "担当",
  "取引",
  "伝票",
  "カード",
  "paypay",
  "suica",
  "icoca",
  "nanaco",
  "waon",
  "edy",
  "id ",
  "qr",
  "バーコード",
  "jre",
  "dポイント",
  "楽天",
  "value",
  "visa",
  "master",
  "jcb",
  "amex",
  "株式会社",
  "有限会社",
  "領収書",
  "レシート",
  "お買上",
  "又は",
  "免税",
  "軽減",
  "標準",
  "内消費税",
  "外消費税",
  "お預り",
  "現計",
  "釣り",
  "預かり",
  "預り金",
  "お預かり金",
  "預り額",
  "支払",
  "決済",
  "cash",
  "change",
  "subtotal",
  "total",
  "tax",
  "amount",
  "receipt",
  "invoice",
  "アルバイト",
  "パート",
  "募集",
  "スタッフ",
  "店",
  "薬局",
  "クスリの",
  "ライフスタイル",
  "応募",
  "お問い合わせ",
  "お問合せ",
] as const;

const RECEIPT_NOISE_PATTERNS: RegExp[] = [
  /^T\d{10,}/i,
  /\bT\d{10,}\b/i,
  /^\d{4}[\/\-年]\d{1,2}[\/\-月]\d{1,2}/,
  /^\d{1,2}[\/\-月]\d{1,2}[\/\-日]?\s*\d{1,2}:\d{2}/,
  /^\d{1,2}:\d{2}(:\d{2})?$/,
  /^0\d{1,4}-\d{1,4}-\d{3,4}$/,
  /^[\d\-()+\s]{10,}$/,
  /^[¥￥]\s*[\d,]+$/,
  /^[\d,]+円?$/,
  /^[\d\s,]+$/,
  /^(?:都|道|府|県).*(?:市|区|町|村)/,
  /^\*+$/,
  /^[-=]+$/,
  /^no\.?\s*\d+$/i,
  /^\d+\s*点$/,
  /^\d+\s*枚$/,
  /^\(\d+\)$/,
];

const PRICE_SUFFIX_PATTERN = /\s*[¥￥]?\s*([\d]{1,3}(?:,\d{3})*|\d+)\s*$/;

/** 品名先頭の商品コード・税率表記（例: 000066, 内8） */
const PRODUCT_CODE_PREFIX_PATTERNS: RegExp[] = [
  /^(?:内|外|軽)\d+[\s　]*/,
  /^\d{4,}[\s　]*/,
  /^[#＃]\d+[\s　]*/,
];

function resolveVisionApiKey(): string | undefined {
  return process.env.GOOGLE_VISION_API_KEY?.trim();
}

function logApiKeyStatus(apiKey: string | undefined): void {
  if (!apiKey) {
    console.error(
      "[OCR] GOOGLE_VISION_API_KEY is missing (.env.local を確認)",
    );
    return;
  }

  console.log("[OCR] GOOGLE_VISION_API_KEY loaded:", {
    length: apiKey.length,
    prefix: apiKey.slice(0, 4),
    source: "process.env.GOOGLE_VISION_API_KEY",
  });
}

function stripDataUrlPrefix(raw: string): { base64: string; mimeType?: string } {
  const trimmed = raw.trim();
  const match = trimmed.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/i);
  if (match) {
    return {
      mimeType: match[1].toLowerCase(),
      base64: match[2],
    };
  }

  return {
    base64: trimmed.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/i, ""),
  };
}

function normalizeMimeType(rawType: string, fileName?: string): string {
  const lowered = rawType.trim().toLowerCase();
  if (lowered === "image/jpg") {
    return "image/jpeg";
  }
  if (SUPPORTED_MIME_TYPES.has(lowered)) {
    return lowered;
  }

  const ext = fileName?.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "heic") return "image/heic";
  if (ext === "heif") return "image/heif";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";

  return "image/jpeg";
}

function logVisionFailure(context: {
  phase: string;
  error: unknown;
  httpStatus?: number;
  mimeType?: string;
  byteLength?: number;
}): void {
  const body =
    context.error && typeof context.error === "object"
      ? (context.error as VisionErrorBody)
      : null;

  console.error("[OCR] Vision API error", {
    phase: context.phase,
    mimeType: context.mimeType,
    byteLength: context.byteLength,
    httpStatus: context.httpStatus ?? body?.error?.code ?? null,
    googleStatus: body?.error?.status ?? null,
    message:
      body?.error?.message ??
      (context.error instanceof Error
        ? context.error.message
        : String(context.error)),
    details: body?.error?.details ?? null,
    raw: body ?? context.error,
  });
}

function resolveHttpStatus(httpStatus: number, body?: VisionErrorBody): number {
  if (httpStatus === 429) return 429;
  if (httpStatus === 403) return 403;
  if (httpStatus === 400) return 400;
  if (body?.error?.code === 429) return 429;
  if (body?.error?.code === 403) return 403;
  if (httpStatus >= 400 && httpStatus < 500) return httpStatus;
  return 500;
}

async function readImageFromRequest(
  request: Request,
): Promise<ImagePayload | null> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = (await request.json()) as {
      imageBase64?: string;
      image?: string;
      mimeType?: string;
    };
    const rawImage = body.imageBase64 ?? body.image;
    if (!rawImage) {
      return null;
    }

    const { base64, mimeType: mimeFromDataUrl } = stripDataUrlPrefix(rawImage);
    if (!base64) {
      return null;
    }

    const buffer = Buffer.from(base64, "base64");
    return {
      base64,
      mimeType: normalizeMimeType(
        mimeFromDataUrl ?? body.mimeType ?? "image/jpeg",
      ),
      byteLength: buffer.byteLength,
    };
  }

  const formData = await request.formData();
  const image = formData.get("image");

  if (!(image instanceof File)) {
    return null;
  }

  const buffer = Buffer.from(await image.arrayBuffer());
  return {
    base64: buffer.toString("base64"),
    mimeType: normalizeMimeType(image.type, image.name),
    byteLength: buffer.byteLength,
  };
}

function validateImagePayload(image: ImagePayload): string | null {
  if (image.byteLength === 0) {
    return "画像データが空です";
  }
  if (image.byteLength < MIN_IMAGE_BYTES) {
    return "画像データが不正です";
  }
  if (image.byteLength > 10 * 1024 * 1024) {
    return "画像サイズが大きすぎます（10MB以下にしてください）";
  }
  if (!SUPPORTED_MIME_TYPES.has(image.mimeType)) {
    return `未対応の画像形式です: ${image.mimeType}`;
  }
  return null;
}

function isReceiptNoiseLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 2) {
    return true;
  }

  const lowered = trimmed.toLowerCase();
  for (const keyword of RECEIPT_NOISE_KEYWORDS) {
    if (lowered.includes(keyword.toLowerCase())) {
      return true;
    }
  }

  for (const pattern of RECEIPT_NOISE_PATTERNS) {
    if (pattern.test(trimmed)) {
      return true;
    }
  }

  return false;
}

function parsePriceFromLine(line: string): number | undefined {
  const match = line.match(PRICE_SUFFIX_PATTERN);
  if (!match) {
    return undefined;
  }

  const value = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(value) || value <= 0 || value > 1_000_000) {
    return undefined;
  }

  return value;
}

function normalizeProductName(rawName: string): string {
  let name = rawName
    .replace(PRICE_SUFFIX_PATTERN, "")
    .replace(/^[\*＊●◆■□▲▼・\s]+/, "")
    .replace(/^\d+\s*[×xX]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();

  let previous = "";
  while (name !== previous) {
    previous = name;
    for (const pattern of PRODUCT_CODE_PREFIX_PATTERNS) {
      name = name.replace(pattern, "").trim();
    }
  }

  return name;
}

function looksLikeProductName(name: string): boolean {
  if (name.length < 2 || name.length > 20) {
    return false;
  }
  if (isReceiptNoiseLine(name)) {
    return false;
  }
  if (!/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(name)) {
    return false;
  }
  if (/^[\d\s¥￥,]+$/.test(name)) {
    return false;
  }
  return true;
}

function parseReceiptLine(line: string): ReceiptItem | null {
  const trimmed = line.trim();
  if (!trimmed || isReceiptNoiseLine(trimmed)) {
    return null;
  }

  const price = parsePriceFromLine(trimmed);
  const name = normalizeProductName(trimmed);
  if (!looksLikeProductName(name)) {
    return null;
  }

  return price !== undefined ? { name, price } : { name };
}

function dedupeReceiptItems(items: ReceiptItem[]): ReceiptItem[] {
  const seen = new Set<string>();
  const result: ReceiptItem[] = [];

  for (const item of items) {
    const key = item.name.normalize("NFKC").toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
  }

  return result;
}

function parseReceiptText(fullText: string): ReceiptParseResult {
  const lines = fullText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const items: ReceiptItem[] = [];
  for (const line of lines) {
    const parsed = parseReceiptLine(line);
    if (parsed) {
      items.push(parsed);
    }
  }

  return { items: dedupeReceiptItems(items) };
}

async function detectReceiptWithVision(input: {
  apiKey: string;
  imageBase64: string;
  byteLength: number;
}): Promise<ReceiptParseResult> {
  const url = `${VISION_ENDPOINT}?key=${encodeURIComponent(input.apiKey)}`;

  console.log("[OCR] Calling Vision API TEXT_DETECTION (receipt)", {
    byteLength: input.byteLength,
    base64Length: input.imageBase64.length,
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requests: [
        {
          image: { content: input.imageBase64 },
          features: [{ type: "TEXT_DETECTION" }],
        },
      ],
    }),
  });

  const body = (await response.json()) as VisionAnnotateResponse;

  if (!response.ok || body.error) {
    logVisionFailure({
      phase: "detectReceiptWithVision",
      error: body.error ?? body,
      httpStatus: response.status,
      byteLength: input.byteLength,
    });
    throw Object.assign(new Error(body.error?.message ?? "Vision API エラー"), {
      httpStatus: response.status,
      body,
    });
  }

  const firstResponse = body.responses?.[0];
  if (firstResponse?.error) {
    logVisionFailure({
      phase: "detectReceiptWithVision.response",
      error: firstResponse.error,
      httpStatus: response.status,
      byteLength: input.byteLength,
    });
    throw Object.assign(
      new Error(firstResponse.error.message ?? "Vision API エラー"),
      {
        httpStatus: response.status,
        body: { error: firstResponse.error },
      },
    );
  }

  const fullText =
    firstResponse?.fullTextAnnotation?.text?.trim() ??
    firstResponse?.textAnnotations?.[0]?.description?.trim() ??
    "";

  console.log("[OCR] Vision API response received", {
    textLength: fullText.length,
    lineCount: fullText ? fullText.split(/\r?\n/).length : 0,
  });

  if (!fullText) {
    return { items: [] };
  }

  const result = parseReceiptText(fullText);
  console.log("[OCR] Receipt parsed", {
    itemCount: result.items.length,
    sample: result.items.slice(0, 5),
  });

  return result;
}

export async function POST(request: Request) {
  console.log("[OCR] API called at:", new Date().toISOString());

  const apiKey = resolveVisionApiKey();
  logApiKeyStatus(apiKey);

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "GOOGLE_VISION_API_KEY が未設定です。.env.local に GOOGLE_VISION_API_KEY を追加してください。",
      },
      { status: 500 },
    );
  }

  let image: ImagePayload | null;
  try {
    image = await readImageFromRequest(request);
  } catch (error) {
    logVisionFailure({
      phase: "readImageFromRequest",
      error,
    });
    return NextResponse.json(
      { error: "画像データの読み込みに失敗しました" },
      { status: 400 },
    );
  }

  if (!image) {
    return NextResponse.json({ error: "画像がありません" }, { status: 400 });
  }

  const validationError = validateImagePayload(image);
  if (validationError) {
    console.error("[OCR] Invalid image payload", {
      mimeType: image.mimeType,
      byteLength: image.byteLength,
      reason: validationError,
    });
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  try {
    const result = await detectReceiptWithVision({
      apiKey,
      imageBase64: image.base64,
      byteLength: image.byteLength,
    });

    return NextResponse.json({ items: result.items });
  } catch (error) {
    const httpStatus =
      typeof error === "object" &&
      error !== null &&
      "httpStatus" in error &&
      typeof (error as { httpStatus: unknown }).httpStatus === "number"
        ? (error as { httpStatus: number }).httpStatus
        : 500;
    const body =
      typeof error === "object" && error !== null && "body" in error
        ? ((error as { body: VisionErrorBody }).body ?? undefined)
        : undefined;

    logVisionFailure({
      phase: "POST",
      error,
      httpStatus,
      mimeType: image.mimeType,
      byteLength: image.byteLength,
    });

    const message =
      body?.error?.message ??
      (error instanceof Error ? error.message : "OCRの処理に失敗しました");

    return NextResponse.json(
      { error: message },
      { status: resolveHttpStatus(httpStatus, body) },
    );
  }
}
