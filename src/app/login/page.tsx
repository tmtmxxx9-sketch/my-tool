"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { isSupabaseConfigured } from "@/utils/supabase/config";

function mapAuthErrorMessage(message: string): string {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("invalid login credentials") ||
    normalized.includes("invalid email or password")
  ) {
    return "メールアドレスまたはパスワードが正しくありません。";
  }

  if (normalized.includes("email not confirmed")) {
    return "メールアドレスの確認が完了していません。";
  }

  if (normalized.includes("too many requests")) {
    return "試行回数が多すぎます。しばらく待ってから再度お試しください。";
  }

  if (normalized.includes("user not found")) {
    return "このメールアドレスは登録されていません。";
  }

  if (normalized.includes("fetch failed") || normalized.includes("network")) {
    return "通信に失敗しました。ネットワーク接続を確認してください。";
  }

  return message || "ログインに失敗しました。";
}

function LoginForm() {
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(() => {
    if (searchParams.get("error") === "auth") {
      return "ログインに失敗しました。もう一度お試しください。";
    }
    if (searchParams.get("next")) {
      return "ログインが必要です。メールアドレスとパスワードを入力してください。";
    }
    return null;
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (isSubmitting) {
      return;
    }

    setErrorMessage(null);

    if (!isSupabaseConfigured()) {
      setErrorMessage("Supabase の環境変数が未設定です。");
      return;
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setErrorMessage("メールアドレスとパスワードを入力してください。");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          email: trimmedEmail,
          password,
        }),
      });

      let payload: { error?: string; success?: boolean } | null = null;
      try {
        payload = (await response.json()) as {
          error?: string;
          success?: boolean;
        };
      } catch {
        payload = null;
      }

      if (!response.ok) {
        const serverMessage = payload?.error?.trim();
        if (serverMessage) {
          setErrorMessage(mapAuthErrorMessage(serverMessage));
        } else if (response.status === 503) {
          setErrorMessage("Supabase の環境変数が未設定です。");
        } else if (response.status >= 500) {
          setErrorMessage(
            "サーバーエラーが発生しました。しばらく待ってから再度お試しください。",
          );
        } else {
          setErrorMessage("ログインに失敗しました。");
        }
        return;
      }

      if (!payload?.success) {
        setErrorMessage(
          "ログインに成功しましたが、セッションを保存できませんでした。Cookie 設定を確認してください。",
        );
        return;
      }

      window.location.href = nextPath.startsWith("/") ? nextPath : "/";
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "ログインに失敗しました。";
      setErrorMessage(mapAuthErrorMessage(message));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-bold text-slate-900">ストックノート</h1>
      <p className="mt-1 text-sm text-slate-500">
        家族グループの在庫管理にログイン
      </p>

      <form
        noValidate
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
        className="mt-6 space-y-4"
      >
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">
            メールアドレス
          </span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            disabled={isSubmitting}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-3 text-base outline-none ring-emerald-500 focus:ring-2 disabled:opacity-60"
            placeholder="you@example.com"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">
            パスワード
          </span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            disabled={isSubmitting}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-3 text-base outline-none ring-emerald-500 focus:ring-2 disabled:opacity-60"
            placeholder="••••••••"
          />
        </label>

        {errorMessage ? (
          <p
            role="alert"
            className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {errorMessage}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              ログイン中...
            </>
          ) : (
            "ログイン"
          )}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-8">
      <Suspense
        fallback={
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
