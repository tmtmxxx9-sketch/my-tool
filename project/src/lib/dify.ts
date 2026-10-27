const TARGET_AGENT = "ソル（Cursor）";
const DIFY_USER = "tomohiro-user";

export interface DifyChatResult {
  answer: string;
  conversationId?: string;
}

interface DifyChatResponse {
  answer?: string;
  conversation_id?: string;
  message?: string;
  code?: string;
}

export async function sendChatMessage(
  query: string,
  conversationId: string | undefined,
  signal: AbortSignal,
): Promise<DifyChatResult> {
  const body: Record<string, unknown> = {
    inputs: {
      target_agent: TARGET_AGENT,
      raw_input: query,
    },
    query,
    response_mode: "blocking",
    user: DIFY_USER,
  };

  if (conversationId) {
    body.conversation_id = conversationId;
  }

  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  const payload = (await response.json().catch(() => null)) as DifyChatResponse | null;

  if (!response.ok) {
    throw new Error(
      payload?.message || `Dify API エラー (${response.status})`,
    );
  }

  const answer = payload?.answer?.trim();
  if (!answer) {
    throw new Error(payload?.message || "Dify から回答テキストが返りませんでした。");
  }

  return {
    answer,
    conversationId: payload?.conversation_id,
  };
}
