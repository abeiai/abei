import { randomUUID } from "node:crypto";
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor
} from "@nestjs/common";
import { catchError, tap, throwError, type Observable } from "rxjs";
import { getRequestIdentity } from "./request-identity.js";
import {
  getRequestPath,
  type HeaderRequestLike,
  type ResponseStatusLike
} from "./request-types.js";
import { appendJsonLog } from "./file-log.js";

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly requestLogger = new Logger("RequestLog");
  private readonly errorLogger = new Logger("ErrorLog");

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<HeaderRequestLike>();
    const response = http.getResponse<ResponseStatusLike>();
    const startedAt = Date.now();
    const requestId = request.requestId ?? randomUUID();
    const method = request.method ?? "UNKNOWN";
    const path = getRequestPath(request);

    request.requestId = requestId;
    response.setHeader?.("x-request-id", requestId);

    return next.handle().pipe(
      tap(() => {
        this.logRequest(request, response, requestId, method, path, startedAt);
      }),
      catchError((error: unknown) => {
        this.logRequest(request, response, requestId, method, path, startedAt, error);
        return throwError(() => error);
      })
    );
  }

  private logRequest(
    request: HeaderRequestLike,
    response: ResponseStatusLike,
    requestId: string,
    method: string,
    path: string,
    startedAt: number,
    error?: unknown
  ) {
    const identity = getRequestIdentity(request);
    const payload = {
      requestId,
      method,
      path,
      statusCode: response.statusCode ?? 500,
      durationMs: Date.now() - startedAt,
      userId: identity.userId,
      adminUserId: identity.adminUserId
    };

    this.requestLogger.log(JSON.stringify(payload));
    appendJsonLog("requests", payload);

    if (error) {
      const errorPayload = {
        requestId,
        method,
        path,
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorMessage: error instanceof Error ? error.message : String(error)
      };

      this.errorLogger.error(JSON.stringify(errorPayload));
      appendJsonLog("errors", errorPayload);
    }
  }
}
