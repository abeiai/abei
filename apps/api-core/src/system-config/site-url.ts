const PRODUCTION_SITE_ORIGIN = "https://xueleai.com";

export function defaultSiteOrigin(environmentUrl: string | undefined, production: boolean) {
  if (production) {
    try {
      return normalizeSiteOrigin(environmentUrl || PRODUCTION_SITE_ORIGIN, true);
    } catch {
      return PRODUCTION_SITE_ORIGIN;
    }
  }
  return normalizeSiteOrigin(environmentUrl || "http://localhost:3600", false);
}

export function normalizeSiteOrigin(value: string, production: boolean) {
  let url: URL;

  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("前台地址必须是完整的 HTTP 或 HTTPS 地址");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("前台地址必须是完整的 HTTP 或 HTTPS 地址");
  }

  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("前台地址必须填写站点根地址，不能包含路径、参数或账号信息");
  }

  if (production && url.protocol !== "https:") {
    throw new Error("生产环境前台地址必须使用 HTTPS");
  }

  if (production && (isIpHostname(url.hostname) || url.hostname === "localhost")) {
    throw new Error("生产环境前台地址不能使用 IP 或 localhost");
  }

  return url.origin;
}

function isIpHostname(hostname: string) {
  const normalized = hostname.replace(/^\[|\]$/g, "");

  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalized) || normalized.includes(":");
}
