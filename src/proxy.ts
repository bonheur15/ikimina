import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only: send visitors without a session cookie to the sign-in page.
// Every page and server action still verifies the session and role itself.
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has("authjs.session-token") || request.cookies.has("__Secure-authjs.session-token");
  if (hasSession) return NextResponse.next();
  const login = new URL("/login", request.url);
  login.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = { matcher: ["/admin/:path*", "/member/:path*"] };
