import { NextRequest, NextResponse } from "next/server";

/**
 * Access control middleware.
 *
 * Reads CLAW_ACCESS_MODE env var (set by bin/claw-console CLI):
 *   "local" → only localhost (default; redundant since server binds 127.0.0.1)
 *   "lan"   → localhost + Tailscale IPs (100.64.0.0/10)
 *   "all"   → no restrictions
 */

const mode = process.env.CLAW_ACCESS_MODE ?? "local";

function isTailscaleIP(ip: string): boolean {
  if (!ip.startsWith("100.")) return false;
  const second = parseInt(ip.split(".")[1], 10);
  return second >= 64 && second <= 127;
}

function isLocalhost(ip: string): boolean {
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

export function middleware(request: NextRequest) {
  // "all" mode — no restrictions
  if (mode === "all") return NextResponse.next();

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "127.0.0.1";

  // Always allow localhost
  if (isLocalhost(ip)) return NextResponse.next();

  // "lan" mode — also allow Tailscale
  if (mode === "lan" && isTailscaleIP(ip)) return NextResponse.next();

  return new NextResponse("403 FORBIDDEN — ACCESS DENIED", {
    status: 403,
    headers: { "Content-Type": "text/plain" },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
