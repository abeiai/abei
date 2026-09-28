import { HttpStatus, ValidationPipe } from "@nestjs/common";
import { AppException } from "./app-exception.js";

export function createValidationPipe() {
  return new ValidationPipe({
    transform: true,
    whitelist: true,
    exceptionFactory: () => new AppException(40001, "请求参数错误", HttpStatus.BAD_REQUEST)
  });
}
