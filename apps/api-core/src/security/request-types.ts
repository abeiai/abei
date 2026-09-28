export interface HeaderRequestLike {
  method?: string;
  originalUrl?: string;
  url?: string;
  ip?: string;
  body?: unknown;
  requestId?: string;
  rawBody?: Buffer;
  headers: {
    authorization?: string;
    cookie?: string;
    "user-agent"?: string | string[];
    "x-forwarded-for"?: string | string[];
    [key: string]: string | string[] | undefined;
  };
  socket?: {
    remoteAddress?: string;
  };
}

export interface ResponseStatusLike {
  statusCode?: number;
  setHeader?(name: string, value: string): void;
}

export function getHeaderValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function getRequestPath(request: HeaderRequestLike) {
  return (request.originalUrl ?? request.url ?? "").split("?")[0] || "/";
}

export function getClientIp(request: HeaderRequestLike) {
  const forwardedFor = getHeaderValue(request.headers["x-forwarded-for"]);

  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || null;
  }

  return request.ip ?? request.socket?.remoteAddress ?? null;
}

export function getUserAgent(request: HeaderRequestLike) {
  return getHeaderValue(request.headers["user-agent"]) ?? null;
}
