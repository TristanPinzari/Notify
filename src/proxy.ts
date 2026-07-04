import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/auth";

export async function proxy(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    const { pathname, search } = request.nextUrl;
    const callbackUrl = pathname.startsWith("/home")
      ? `?callbackUrl=${encodeURIComponent(pathname + search)}`
      : "";
    return NextResponse.redirect(new URL(`/sign-in${callbackUrl}`, request.url));
  }

  const response = NextResponse.next();
  response.headers.set("x-search", request.nextUrl.search);
  return response;
}

export const config = {
  matcher: ["/home/:path*", "/verified", "/email-change-confirmed"],
};
