export function isProviderRequestTimeout(error: unknown, aborted = false): boolean {
  if (aborted) return true;
  const visited = new Set<unknown>();
  while (error && typeof error === "object" && !visited.has(error)) {
    visited.add(error);
    const current = error as { name?: string; code?: string; cause?: unknown };
    if (current.name === "AbortError" || current.name === "TimeoutError") return true;
    if (current.code && [
      "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT"
    ].includes(current.code)) return true;
    error = current.cause;
  }
  return false;
}
