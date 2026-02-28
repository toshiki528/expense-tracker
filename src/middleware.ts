import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  // Skip auth for static assets, API routes, manifest, SW
  if (
    req.nextUrl.pathname.startsWith("/_next") ||
    req.nextUrl.pathname.startsWith("/api") ||
    req.nextUrl.pathname === "/manifest.json" ||
    req.nextUrl.pathname === "/sw.js" ||
    req.nextUrl.pathname.match(/\.(ico|png|jpg|svg)$/)
  ) {
    return NextResponse.next();
  }

  const auth = req.headers.get("authorization");
  if (auth) {
    const [, encoded] = auth.split(" ");
    const decoded = atob(encoded);
    const [user, pass] = decoded.split(":");
    if (user === process.env.BASIC_AUTH_USER && pass === process.env.BASIC_AUTH_PASSWORD) {
      return NextResponse.next();
    }
  }

  return new NextResponse("Unauthorized", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Secure Area"' },
  });
}
