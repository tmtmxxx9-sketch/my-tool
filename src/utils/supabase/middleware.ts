import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  getSupabaseAnonKey,
  getSupabaseUrl,
  isSupabaseConfigured,
} from "./config";

function copySupabaseCookies(
  source: NextResponse,
  target: NextResponse,
): NextResponse {
  source.cookies.getAll().forEach(({ name, value, ...options }) => {
    target.cookies.set(name, value, options);
  });
  return target;
}

export async function updateSession(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // createServerClient 直後に getUser を呼ぶ（Supabase SSR 推奨）
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isLoginPage = pathname.startsWith("/login");
  const isAuthRoute =
    pathname.startsWith("/auth/callback") ||
    pathname.startsWith("/api/auth/");

  if (!user && !isLoginPage && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    if (pathname !== "/") {
      url.searchParams.set("next", pathname);
    }
    return copySupabaseCookies(
      supabaseResponse,
      NextResponse.redirect(url),
    );
  }

  if (user && isLoginPage) {
    const next = request.nextUrl.searchParams.get("next") ?? "/";
    const redirectUrl = new URL(next, request.url);
    return copySupabaseCookies(
      supabaseResponse,
      NextResponse.redirect(redirectUrl),
    );
  }

  return supabaseResponse;
}
