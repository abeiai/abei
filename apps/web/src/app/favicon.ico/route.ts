export const dynamic = "force-dynamic";

interface ApiResponse<TData> {
  code: number;
  data: TData | null;
  message: string;
}

interface PublicSystemConfig {
  key: string;
  value: string;
}

function getApiBaseUrl() {
  return process.env.API_BASE_URL ?? "http://localhost:3322/api";
}

export async function GET(request: Request) {
  const origin = publicOrigin(request);
  const fallback = new URL("/favicon.svg", origin);

  try {
    const response = await fetch(`${getApiBaseUrl()}/system-config/public`, {
      cache: "no-store",
      headers: {
        "Content-Type": "application/json"
      }
    });
    const payload = (await response.json()) as ApiResponse<PublicSystemConfig[]>;
    const favicon = payload.data?.find((item) => item.key === "siteFavicon")?.value.trim();

    if (favicon) {
      return Response.redirect(new URL(favicon, origin), 302);
    }
  } catch {
    return Response.redirect(fallback, 302);
  }

  return Response.redirect(fallback, 302);
}

function publicOrigin(request: Request) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";

  if (host && !host.startsWith("0.0.0.0") && !host.startsWith("127.0.0.1")) {
    return `${proto}://${host}`;
  }

  return (process.env.APP_BASE_URL ?? "http://localhost:3321").replace(/\/+$/, "");
}
