import type { ErrorRequestHandler } from "express";
import { createRequire } from "node:module";
import type { NestExpressApplication } from "@nestjs/platform-express";
// Resolve the platform's own Express copy, avoiding an unrelated second parser stack.
const require = createRequire(import.meta.url);
const express = require(
  require.resolve("express", {
    paths: [require.resolve("@nestjs/platform-express")],
  }),
);
export function installCreatorMcpParser(app: NestExpressApplication) {
  app.use("/api/creator-mcp", express.json({ limit: "256kb", strict: true }));
  const onParserError: ErrorRequestHandler = (error: unknown, req, res, next) => {
    const type = error && typeof error === "object" && "type" in error ? error.type : undefined;
    if (!/^\/api\/creator-mcp\/?$/.test(req.path)) return next(error);
    const status = type === "entity.too.large" ? 413 : 400;
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Pragma", "no-cache");
    res
      .status(status)
      .json({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: type === "entity.parse.failed" ? -32700 : -32600,
          message: status === 413 ? "请求内容过大" : "请求格式错误",
        },
      });
  };
  app.use(onParserError);
}
