import "reflect-metadata";
import { installCreatorMcpParser } from "./creator-mcp/creator-mcp.middleware.js";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module.js";
import { HttpExceptionFilter } from "./common/http-exception.filter.js";
import { createValidationPipe } from "./common/validation.js";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    bodyParser: false
  });
  const bodyLimit = process.env.API_BODY_LIMIT ?? "12mb";

  app.set("trust proxy", "loopback, linklocal, uniquelocal");
  installCreatorMcpParser(app);
  app.useBodyParser("json", {
    limit: bodyLimit
  });
  app.useBodyParser("urlencoded", {
    extended: true,
    limit: bodyLimit
  });

  app.useBodyParser("text", { type: ["application/xml", "text/xml"], limit: "64kb" });

  app.setGlobalPrefix("api");
  app.enableCors({
    origin: process.env.APP_BASE_URL ?? "http://localhost:3600",
    credentials: true
  });
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalPipes(createValidationPipe());

  const port = Number(process.env.API_CORE_PORT ?? 3602);
  await app.listen(port, "0.0.0.0");
}

void bootstrap();
