import { HttpException, HttpStatus } from "@nestjs/common";

export class AppException extends HttpException {
  constructor(
    public readonly code: number,
    message: string,
    status = HttpStatus.BAD_REQUEST
  ) {
    super(message, status);
  }
}
