import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module.js";
import { HttpExceptionFilter } from "./common/http-exception.filter.js";
import { createValidationPipe } from "./common/validation.js";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true
  });
  const bodyLimit = process.env.API_BODY_LIMIT ?? "12mb";

  app.set("trust proxy", "loopback, linklocal, uniquelocal");
  app.useBodyParser("json", {
    limit: bodyLimit
  });
  app.useBodyParser("urlencoded", {
    extended: true,
    limit: bodyLimit
  });

  app.setGlobalPrefix("api");
  app.enableCors({
    origin: process.env.APP_BASE_URL ?? "http://localhost:3321",
    credentials: true
  });
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalPipes(createValidationPipe());

  const port = Number(process.env.API_CORE_PORT ?? 3322);
  await app.listen(port, "0.0.0.0");
}

void bootstrap();
