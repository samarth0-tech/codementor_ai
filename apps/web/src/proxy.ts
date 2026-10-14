import { NextResponse } from "next/server";
import { auth } from "@/auth";

// Next.js 16 calls this file "proxy" (it used to be "middleware"). It runs before pages render.
// This is a convenience for the user (nice redirects). The REAL access control is in Express.

const PUBLIC_PATHS = ["/", "/login", "/register"];

export default auth((req) => {
  const { pathname, searchParams } = req.nextUrl;
  const session = req.auth;
  const isPublic = PUBLIC_PATHS.includes(pathname);

  if (!session && !isPublic) {
    const url = new URL("/login", req.nextUrl.origin);
    url.searchParams.set("callbackUrl", pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }

  // Signed-in users do not need the login/register pages ("?error" means the session went stale).
  if (
    session &&
    (pathname === "/login" || pathname === "/register") &&
    !searchParams.has("error")
  ) {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl.origin));
  }

  if (session && pathname.startsWith("/admin") && session.user.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
