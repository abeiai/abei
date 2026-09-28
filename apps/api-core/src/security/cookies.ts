interface RequestLike {
  headers: {
    cookie?: string;
    authorization?: string;
  };
}

export interface ResponseLike {
  cookie(name: string, value: string, options: Record<string, unknown>): void;
  clearCookie(name: string, options: Record<string, unknown>): void;
}

export const userAccessCookie = "xueleai_user_access";
export const userRefreshCookie = "xueleai_user_refresh";
export const adminAccessCookie = "xueleai_admin_access";
export const adminRefreshCookie = "xueleai_admin_refresh";
export const profileContextCookie = "xueleai_profile_context";

interface ProfileContextTransitionLike {
  token: string;
  maxAgeSeconds: number;
}

function shouldUseSecureCookies() {
  const appBaseUrl = process.env.APP_BASE_URL?.trim().toLowerCase();

  if (appBaseUrl) {
    return appBaseUrl.startsWith("https://");
  }

  return process.env.NODE_ENV === "production";
}

export function readCookie(request: RequestLike, name: string) {
  const cookieHeader = request.headers.cookie;

  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(";").map((cookie) => cookie.trim());
  const cookie = cookies.find((item) => item.startsWith(`${name}=`));

  if (!cookie) {
    return null;
  }

  try {
    return decodeURIComponent(cookie.slice(name.length + 1));
  } catch {
    return null;
  }
}

export function readBearerToken(request: RequestLike) {
  const authorization = request.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length);
}

export function setAuthCookies(
  response: ResponseLike,
  accessCookieName: string,
  refreshCookieName: string,
  accessToken: string,
  refreshToken: string,
  accessMaxAge: number,
  refreshMaxAge: number
) {
  const baseOptions = {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookies(),
    path: "/"
  };

  response.cookie(accessCookieName, accessToken, {
    ...baseOptions,
    maxAge: accessMaxAge * 1000
  });
  response.cookie(refreshCookieName, refreshToken, {
    ...baseOptions,
    maxAge: refreshMaxAge * 1000
  });
}

export function setAccessCookie(
  response: ResponseLike,
  accessCookieName: string,
  accessToken: string,
  accessMaxAge: number
) {
  response.cookie(accessCookieName, accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookies(),
    path: "/",
    maxAge: accessMaxAge * 1000
  });
}

export function clearAuthCookies(
  response: ResponseLike,
  accessCookieName: string,
  refreshCookieName: string
) {
  const options = {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookies(),
    path: "/"
  };

  response.clearCookie(accessCookieName, options);
  response.clearCookie(refreshCookieName, options);
}

export function setProfileContextCookie(
  response: ResponseLike,
  transition: ProfileContextTransitionLike
) {
  response.cookie(profileContextCookie, transition.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookies(),
    path: "/",
    maxAge: transition.maxAgeSeconds * 1000
  });
}

export function clearProfileContextCookie(response: ResponseLike) {
  response.clearCookie(profileContextCookie, {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookies(),
    path: "/"
  });
}
