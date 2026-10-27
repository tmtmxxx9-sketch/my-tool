import { useEffect, useRef, useState } from "react";
import { Check, Copy, Download, Send, Sparkles, Trash2 } from "lucide-react";
import { downloadChatHistory } from "@/lib/chatHistory";
import { sendChatMessage } from "@/lib/dify";

type Role = "user" | "assistant";

interface Message {
  id: string;
  role: Role;
  content: string;
  isError?: boolean;
}

interface TypingState {
  id: string;
  count: number;
}

const TYPE_INTERVAL_MS = 25;
const COPY_FEEDBACK_MS = 1800;

const GREETING: Message = {
  id: "greeting",
  role: "assistant",
  content:
    "こんにちは！AI アシスタントです。お手伝いできることは何でもお気軽にお聞きください。質問の作成、文章の推敲、アイデア出しなど、幅広くサポートいたします。",
};

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function charCount(text: string): number {
  return Array.from(text).length;
}

function revealText(text: string, count: number): string {
  return Array.from(text).slice(0, count).join("");
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand("copy");
    area.remove();
    if (!copied) throw new Error("copy failed");
  }
}

function App() {
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [typing, setTyping] = useState<TypingState | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const conversationIdRef = useRef<string | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);

  const inputLocked = isThinking || typing !== null;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: typing ? "auto" : "smooth",
    });
  }, [messages, isThinking, typing]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  useEffect(() => {
    if (!typing) return;
    const message = messages.find((item) => item.id === typing.id);
    if (!message) {
      setTyping(null);
      return;
    }
    if (typing.count >= charCount(message.content)) {
      setTyping(null);
      return;
    }

    const timer = window.setTimeout(() => {
      setTyping((current) => {
        if (!current || current.id !== typing.id) return current;
        return { id: current.id, count: current.count + 1 };
      });
    }, TYPE_INTERVAL_MS);

    return () => window.clearTimeout(timer);
  }, [typing, messages]);

  const canSend = input.trim().length > 0 && !inputLocked;

  async function handleSend() {
    if (!canSend) return;
    const text = input.trim();
    const userMsg: Message = { id: newId(), role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsThinking(true);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 120_000);

    try {
      const result = await sendChatMessage(
        text,
        conversationIdRef.current,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      if (result.conversationId) {
        conversationIdRef.current = result.conversationId;
      }
      const aiMsg: Message = {
        id: newId(),
        role: "assistant",
        content: result.answer,
      };
      setMessages((prev) => [...prev, aiMsg]);
      setTyping({ id: aiMsg.id, count: 0 });
    } catch (error) {
      if (controller.signal.aborted && abortRef.current !== controller) return;
      const timedOut = controller.signal.aborted;
      const detail =
        error instanceof Error && error.name !== "AbortError"
          ? error.message
          : "";
      const content = timedOut
        ? "応答がタイムアウトしました。しばらくしてからもう一度送信してください。"
        : detail || "メッセージの送信に失敗しました。";
      setMessages((prev) => [
        ...prev,
        { id: newId(), role: "assistant", content, isError: true },
      ]);
    } finally {
      window.clearTimeout(timeout);
      if (abortRef.current === controller) {
        abortRef.current = null;
        setIsThinking(false);
      }
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleClear() {
    abortRef.current?.abort();
    abortRef.current = null;
    conversationIdRef.current = undefined;
    setMessages([GREETING]);
    setInput("");
    setIsThinking(false);
    setTyping(null);
  }

  function handleExport() {
    downloadChatHistory(
      messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    );
  }

  const placeholder = isThinking
    ? "回答を待っています..."
    : typing
      ? "回答を表示しています..."
      : "メッセージを入力...";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-sky-50 to-indigo-50 flex flex-col">
      <header className="sticky top-0 z-20 backdrop-blur-md bg-white/80 border-b border-slate-200/70 shadow-sm">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative h-10 w-10 shrink-0 rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center shadow-md shadow-indigo-500/30">
              <Sparkles className="h-5 w-5 text-white" strokeWidth={2.2} />
            </div>
            <div className="leading-tight min-w-0">
              <h1 className="text-[15px] font-semibold text-slate-800">
                AI アシスタント
              </h1>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                <span className="text-xs font-medium text-emerald-600">
                  オンライン
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExport}
              className="group inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-600 transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60"
              aria-label="履歴を保存"
            >
              <Download className="h-4 w-4 transition-transform group-hover:translate-y-0.5" />
              <span className="hidden sm:inline">履歴を保存</span>
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="group inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-600 transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60"
              aria-label="会話をクリア"
            >
              <Trash2 className="h-4 w-4 transition-transform group-hover:-translate-y-0.5" />
              <span className="hidden sm:inline">会話をクリア</span>
            </button>
          </div>
        </div>
      </header>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto scroll-smooth px-4 sm:px-6 py-6"
      >
        <div className="mx-auto max-w-3xl space-y-5">
          {messages.map((message) => {
            const isRevealing = typing?.id === message.id;
            const shown = isRevealing
              ? revealText(message.content, typing.count)
              : message.content;
            return (
              <MessageBubble
                key={message.id}
                message={message}
                shown={shown}
                isRevealing={isRevealing}
              />
            );
          })}

          {isThinking && <ThinkingIndicator />}
        </div>
      </div>

      <footer className="sticky bottom-0 z-20 bg-gradient-to-t from-slate-50 via-slate-50/95 to-transparent pt-4 pb-4 px-4 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <div
            className={`rounded-3xl border bg-white p-2 shadow-lg shadow-slate-900/5 transition-all ${
              inputLocked
                ? "border-slate-200"
                : "border-slate-200 focus-within:border-sky-300 focus-within:ring-4 focus-within:ring-sky-500/10"
            }`}
          >
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                disabled={inputLocked}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                aria-busy={inputLocked}
                className="flex-1 resize-none bg-transparent px-3 py-2.5 text-[15px] leading-relaxed text-slate-800 placeholder:text-slate-400 focus:outline-none max-h-40 disabled:cursor-not-allowed disabled:text-slate-400"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={!canSend}
                aria-label="送信"
                className="group flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-md shadow-indigo-500/30 transition-all hover:shadow-lg hover:shadow-indigo-500/40 active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none"
              >
                <Send
                  className="h-5 w-5 transition-transform group-enabled:group-hover:translate-x-0.5 group-enabled:group-hover:-translate-y-0.5"
                  strokeWidth={2.2}
                />
              </button>
            </div>
          </div>
          <p className="mt-2 text-center text-[11px] text-slate-400">
            {inputLocked
              ? "回答の表示が終わるまで送信できません"
              : "Enter で送信 ・ Shift + Enter で改行"}
          </p>
        </div>
      </footer>
    </div>
  );
}

function MessageBubble({
  message,
  shown,
  isRevealing,
}: {
  message: Message;
  shown: string;
  isRevealing: boolean;
}) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end animate-fade-in-up">
        <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-br-md bg-gradient-to-br from-sky-500 to-indigo-600 px-4 py-3 text-[15px] leading-relaxed text-white shadow-md shadow-indigo-500/20">
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start gap-2.5 animate-fade-in-up">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 shadow-sm">
        <Sparkles className="h-5 w-5 text-white" strokeWidth={2.2} />
      </div>
      <div
        className={`max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-tl-md px-4 py-3 text-[15px] leading-relaxed shadow-sm ring-1 ${
          message.isError
            ? "bg-rose-50 text-rose-700 ring-rose-100"
            : "bg-white text-slate-700 ring-slate-100"
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 flex-1 whitespace-pre-wrap break-words">
            {shown}
            {isRevealing && (
              <span
                aria-hidden="true"
                className="ml-0.5 inline-block h-[1.05em] w-0.5 translate-y-0.5 rounded-full bg-sky-500 align-middle animate-caret"
              />
            )}
          </p>
          <CopyButton text={message.content} />
        </div>
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  async function handleCopy() {
    try {
      await copyText(text);
    } catch {
      return;
    }
    setCopied(true);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setCopied(false);
      timerRef.current = null;
    }, COPY_FEEDBACK_MS);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? "コピーしました！" : "回答をコピー"}
      className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 ${
        copied
          ? "text-emerald-600"
          : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
      }`}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5" strokeWidth={2.4} />
      ) : (
        <Copy className="h-3.5 w-3.5" strokeWidth={2.2} />
      )}
      {copied && <span>コピーしました！</span>}
    </button>
  );
}

function ThinkingIndicator() {
  return (
    <div className="flex justify-start gap-2.5 animate-fade-in-up">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 shadow-sm">
        <Sparkles className="h-5 w-5 text-white" strokeWidth={2.2} />
      </div>
      <div className="rounded-2xl rounded-tl-md bg-white px-4 py-3.5 shadow-sm ring-1 ring-slate-100">
        <div className="flex items-center gap-1.5">
          <Dot delay="0ms" />
          <Dot delay="150ms" />
          <Dot delay="300ms" />
          <span className="ml-1.5 text-sm text-slate-400">AIが考え中...</span>
        </div>
      </div>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="inline-block h-2 w-2 rounded-full bg-sky-500 animate-bounce-dot"
      style={{ animationDelay: delay }}
    />
  );
}

export default App;
