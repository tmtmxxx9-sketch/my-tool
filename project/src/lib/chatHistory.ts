export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export function chatHistoryFilename(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `chat-history-${year}${month}${day}.md`;
}

export function buildChatMarkdown(messages: ChatTurn[], savedAt: Date): string {
  const savedAtLabel = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(savedAt);

  const sections = messages.map((message) => {
    const speaker = message.role === "user" ? "ユーザー" : "AI";
    return `## ${speaker}\n\n${message.content}`;
  });

  return `# 会話履歴\n\n保存日時: ${savedAtLabel}\n\n${sections.join("\n\n")}\n`;
}

export function downloadChatHistory(messages: ChatTurn[], savedAt = new Date()): void {
  const filename = chatHistoryFilename(savedAt);
  const markdown = buildChatMarkdown(messages, savedAt);
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
