import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { AppException } from "./app-exception.js";
import { failureResponse } from "./api-response.js";
import type { HeaderRequestLike } from "../security/request-types.js";
import { appendJsonLog } from "../security/file-log.js";

interface ResponseLike {
  setHeader?(name: string, value: string): void;
  status(statusCode: number): {
    json(body: unknown): void;
  };
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const request = host.switchToHttp().getRequest<HeaderRequestLike>();
    const response = host.switchToHttp().getResponse<ResponseLike>();
    const requestId = request.requestId ?? randomUUID();
    const path = (request.originalUrl ?? request.url ?? "").split("?")[0] ?? "";
    if (path.startsWith("/api/creator-auth/")) {
      response.setHeader?.("Cache-Control", "no-store");
      response.setHeader?.("Pragma", "no-cache");
      response.setHeader?.("Referrer-Policy", "no-referrer");
    }
    // OAuth wire errors must survive global filters, including parser/404 errors.
    if (/^\/api\/creator-auth\/(?:oauth(?:\/|$)|metadata$|resource-metadata$)/.test(path)) {
      const status = exception instanceof HttpException ? exception.getStatus() : 500;
      const payload = exception instanceof HttpException ? exception.getResponse() : null;
      const protocol = payload && typeof payload === "object" && "error" in payload && "error_description" in payload;
      response.status(status).json(protocol ? payload : {
        error: status === 429 ? "temporarily_unavailable" : status >= 500 ? "server_error" : "invalid_request",
        error_description: status >= 500 ? "授权服务暂不可用" : "授权请求无效"
      });
      return;
    }

    if (exception instanceof AppException) {
      response.status(exception.getStatus()).json(failureResponse(exception.code, exception.message));
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const message = status === HttpStatus.UNAUTHORIZED ? "请先登录" : "请求处理失败";

      response.status(status).json(failureResponse(status === 401 ? 40101 : 50000, message));
      return;
    }

    const errorPayload = {
      requestId,
      errorName: exception instanceof Error ? exception.name : "UnknownError",
      errorMessage: exception instanceof Error ? exception.message : String(exception)
    };

    this.logger.error(JSON.stringify(errorPayload));
    appendJsonLog("errors", errorPayload);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(failureResponse(50000, "服务器开小差了"));
  }
}
