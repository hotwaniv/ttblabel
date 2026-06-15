import { type NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { isDevelopmentEnvironment } from "./lib/constants";

const publicPages = ["/login", "/register"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/ping")) {
    return new Response("pong", { status: 200 });
  }

  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    secureCookie: !isDevelopmentEnvironment,
  });

  const isPublicPage = publicPages.includes(pathname);

  if (!token) {
    if (isPublicPage) {
      return NextResponse.next();
    }

    const loginUrl = new URL(`${base}/login`, request.url);
    loginUrl.searchParams.set(
      "callbackUrl",
      encodeURIComponent(pathname === "/" ? "/" : pathname)
    );

    return NextResponse.redirect(loginUrl);
  }

  if (isPublicPage) {
    return NextResponse.redirect(new URL(`${base}/`, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/api/:path*",
    "/login",
    "/register",

    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
