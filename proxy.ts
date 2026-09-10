import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  return proxy(request);
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });


  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://cipfkcsknxjemdmdkpyp.supabase.co";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNpcGZrY3NrbnhqZW1kbWRrcHlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5MTcwNDEsImV4cCI6MjEwMzQ5MzA0MX0.xAx-eX1P_DutARKi_fDy0XMhyhvN_gjpk4kJsb9yyc0";

  const supabase = createServerClient(
    url,
    key,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Refresh the session — without this, sessions expire mid-use silently.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAppPath = request.nextUrl.pathname.startsWith("/") &&
    !request.nextUrl.pathname.startsWith("/login") &&
    !request.nextUrl.pathname.startsWith("/api") &&
    !request.nextUrl.pathname.startsWith("/_next");

  if (isAppPath && !user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
