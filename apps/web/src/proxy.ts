import { NextResponse, type NextRequest } from "next/server";
import {
  isPublicLearningSharePath,
  profileContinuationPath,
  profileLoginHref,
  selectorLoginContinuation
} from "@/lib/profile-routing";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPageNavigation = request.method === "GET" || request.method === "HEAD";

  if (/^\/u\/[a-z0-9]{4,32}$/.test(pathname) && request.method === "GET" && !request.headers.has("next-router-prefetch") && request.headers.get("purpose") !== "prefetch") {
    const response = NextResponse.next();
    if (!request.cookies.has("xueleai_user_access") && !request.cookies.has("xueleai_user_refresh")) {
      try {
        const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:3322/api";
        const result = await fetch(`${apiBaseUrl}/referrals/visit/${pathname.split("/")[2]}`, {
          method: "POST", cache: "no-store", signal: AbortSignal.timeout(4000),
          headers: { Cookie: request.headers.get("cookie") ?? "", "X-Forwarded-For": request.headers.get("x-real-ip") ?? "" }
        });
        const payload = await result.json() as { code: number; data?: { token: string; expiresAt: string } };
        if (result.ok && payload.code === 0 && payload.data) response.cookies.set("xueleai_referral", payload.data.token, {
          httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:", path: "/", expires: new Date(payload.data.expiresAt)
        });
      } catch { /* An attribution outage must not block public browsing. */ }
    }
    return response;
  }

  if (pathname.startsWith("/admin") && pathname !== "/admin/login" && pathname !== "/admin/setup") {
    const setupStatus = pathname === "/admin/system/env-check" ? null : await readSetupStatus(request);

    if (setupStatus && !setupStatus.isInitialized) {
      return NextResponse.redirect(new URL("/admin/setup", request.url));
    }

    const adminAccessToken = request.cookies.get("xueleai_admin_access")?.value;
    const adminRefreshToken = request.cookies.get("xueleai_admin_refresh")?.value;

    if (!adminAccessToken && !adminRefreshToken && isPageNavigation) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }

    if (isPageNavigation && await isAdminSessionInvalid(request)) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
  }

  if (pathname.startsWith("/dashboard")) {
    const userAccessToken = request.cookies.get("xueleai_user_access")?.value;
    const userRefreshToken = request.cookies.get("xueleai_user_refresh")?.value;

    if (!userAccessToken && !userRefreshToken && isPageNavigation) {
      return NextResponse.redirect(loginUrl(request));
    }
  }

  if (pathname === "/select-profile" || pathname === "/learn" || pathname.startsWith("/learn/")) {
    const userAccessToken = request.cookies.get("xueleai_user_access")?.value;
    const userRefreshToken = request.cookies.get("xueleai_user_refresh")?.value;

    if (!isPublicLearningSharePath(pathname) && !userAccessToken && !userRefreshToken && isPageNavigation) {
      return NextResponse.redirect(loginUrl(request));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/u/:path*", "/dashboard", "/dashboard/:path*", "/select-profile", "/learn", "/learn/:path*", "/admin/:path*"]
};

function loginUrl(request: NextRequest) {
  const requestedPath = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  const next =
    request.nextUrl.pathname === "/select-profile"
      ? selectorLoginContinuation(requestedPath)
      : profileContinuationPath(requestedPath);
  return new URL(profileLoginHref(next), request.url);
}

async function isAdminSessionInvalid(request: NextRequest) {
  try {
    const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:3602/api";
    const response = await fetch(`${apiBaseUrl}/admin-auth/me`, {
      headers: { Cookie: request.headers.get("cookie") ?? "" },
      cache: "no-store",
      signal: AbortSignal.timeout(4000)
    });
    if (response.status === 401 || response.status === 403) return true;
    const payload = await response.json() as { code?: number };
    return payload.code === 40101 || payload.code === 40301;
  } catch {
    // A temporary API outage is not evidence that the session has expired.
    return false;
  }
}

async function readSetupStatus(request: NextRequest) {
  try {
    const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:3322/api";
    const response = await fetch(`${apiBaseUrl}/setup/status`, {
      headers: {
        Cookie: request.headers.get("cookie") ?? ""
      },
      cache: "no-store"
    });
    const payload = (await response.json()) as {
      code?: number;
      data?: {
        isInitialized?: boolean;
      };
    };

    if (!response.ok || payload.code !== 0 || typeof payload.data?.isInitialized !== "boolean") {
      return null;
    }

    return {
      isInitialized: payload.data.isInitialized
    };
  } catch {
    return null;
  }
}
