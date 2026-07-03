import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/auth";

export async function proxy(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/home/:path*", "/verified", "/email-verified", "/email-change-confirmed"],
};
