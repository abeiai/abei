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
