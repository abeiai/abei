import { HttpStatus } from "@nestjs/common";
import { AppException } from "../common/app-exception.js";

export const pictureBookPrimaryImageTimeoutMs = 120_000;

export class AbeiaiImageConnectionError extends AppException {
  constructor(timedOut: boolean) {
    super(50201, timedOut ? "阿贝智能图片生成请求超时，请稍后重试。"
      : "阿贝智能图片生成服务暂时无法连接，请稍后重试。", HttpStatus.BAD_GATEWAY);
  }
}

export function isImageProviderConnectionFailure(error: unknown, aborted = false): boolean {
  if (aborted) return true;
  if (!(error instanceof Error)) return false;
  if (["AbortError", "TimeoutError"].includes(error.name)) return true;
  if (error instanceof TypeError && ["fetch failed", "terminated"].includes(error.message)) return true;
  const code = (error as Error & { code?: string }).code;
  if (code && ["ETIMEDOUT", "ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN",
    "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT", "UND_ERR_SOCKET"].includes(code)) return true;
  return error.cause !== error && isImageProviderConnectionFailure(error.cause);
}
