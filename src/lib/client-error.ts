export class BulkInsertError extends Error {
  httpStatus?: number;
  responseBody?: unknown;
  rawResponseText?: string;

  constructor(
    message: string,
    options?: {
      httpStatus?: number;
      responseBody?: unknown;
      rawResponseText?: string;
      cause?: unknown;
    },
  ) {
    super(message);
    this.name = "BulkInsertError";
    this.httpStatus = options?.httpStatus;
    this.responseBody = options?.responseBody;
    this.rawResponseText = options?.rawResponseText;
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  return fallback;
}

export function formatSupabaseError(error: {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
}): string {
  return [error.message, error.code, error.details, error.hint]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(" / ");
}

export function formatBulkInsertErrorMessage(error: unknown): string {
  if (!(error instanceof BulkInsertError)) {
    return getErrorMessage(error, "一括登録に失敗しました");
  }

  const parts = [error.message];

  if (error.httpStatus) {
    parts.push(`HTTP ${error.httpStatus}`);
  }

  if (
    error.responseBody &&
    typeof error.responseBody === "object" &&
    error.responseBody !== null &&
    "details" in error.responseBody
  ) {
    const details = (error.responseBody as { details?: unknown }).details;
    if (typeof details === "string" && details.trim()) {
      parts.push(details.trim());
    } else if (details && typeof details === "object") {
      parts.push(formatSupabaseError(details as Parameters<typeof formatSupabaseError>[0]));
    }
  }

  if (
    error.responseBody &&
    typeof error.responseBody === "object" &&
    error.responseBody !== null &&
    "userId" in error.responseBody
  ) {
    const userId = (error.responseBody as { userId?: unknown }).userId;
    if (typeof userId === "string" && userId.trim()) {
      parts.push(`user_id: ${userId}`);
    }
  }

  if (
    !error.responseBody &&
    error.rawResponseText &&
    error.rawResponseText.trim()
  ) {
    parts.push(error.rawResponseText.trim().slice(0, 200));
  }

  return parts.join(" / ");
}

export function logClientError(context: string, error: unknown): void {
  console.error(`[${context}]`, error);

  if (error instanceof Error) {
    console.error(`[${context}] message:`, error.message);
    if (error.stack) {
      console.error(`[${context}] stack:`, error.stack);
    }
    if (error.cause !== undefined) {
      console.error(`[${context}] cause:`, error.cause);
    }
  }

  if (error instanceof BulkInsertError) {
    console.error(`[${context}] httpStatus:`, error.httpStatus ?? null);
    console.error(`[${context}] responseBody:`, error.responseBody ?? null);
    console.error(`[${context}] rawResponseText:`, error.rawResponseText ?? null);
  }

  if (error && typeof error === "object") {
    try {
      console.error(
        `[${context}] serialized:`,
        JSON.stringify(error, Object.getOwnPropertyNames(error), 2),
      );
    } catch {
      console.error(`[${context}] serialized:`, error);
    }
  }
}
