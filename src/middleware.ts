import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  // Skip auth for static assets, manifest, SW
  if (
    req.nextUrl.pathname.startsWith("/_next") ||
    req.nextUrl.pathname === "/manifest.json" ||
    req.nextUrl.pathname === "/sw.js" ||
    req.nextUrl.pathname.match(/\.(ico|png|jpg|jpeg|svg|webp|gif)$/)
  ) {
    return NextResponse.next();
  }

  const auth = req.headers.get("authorization");
  if (auth) {
    try {
      const parts = auth.split(" ");
      if (parts.length === 2 && parts[0] === "Basic") {
        const decoded = atob(parts[1]);
        const [user, pass] = decoded.split(":");
        if (user === process.env.BASIC_AUTH_USER && pass === process.env.BASIC_AUTH_PASSWORD) {
          return NextResponse.next();
        }
      }
    } catch {
      // malformed Authorization header — fall through to 401
    }
  }

  return new NextResponse("Unauthorized", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Secure Area"' },
  });
}
