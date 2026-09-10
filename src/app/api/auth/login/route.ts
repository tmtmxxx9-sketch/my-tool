import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { isSupabaseConfigured } from "@/utils/supabase/config";

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase の環境変数が未設定です。" },
      { status: 503 },
    );
  }

  let body: { email?: string; password?: string };
  try {
    body = (await request.json()) as { email?: string; password?: string };
  } catch {
    return NextResponse.json(
      { error: "リクエスト形式が正しくありません。" },
      { status: 400 },
    );
  }

  const email = body.email?.trim() ?? "";
  const password = body.password ?? "";

  if (!email || !password) {
    return NextResponse.json(
      { error: "メールアドレスとパスワードを入力してください。" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  if (!data.session) {
    return NextResponse.json(
      {
        error:
          "ログインに成功しましたが、セッションを保存できませんでした。Cookie 設定を確認してください。",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
