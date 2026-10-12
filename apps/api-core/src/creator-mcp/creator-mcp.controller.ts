import { All, Controller, Inject, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CreatorAuthService } from "../creator-auth/creator-auth.service.js";
import {
  CREATOR_MCP_AUDIENCE,
  CreatorOAuthError,
  creatorMainOrigin,
  creatorUnauthorizedChallenge,
} from "../creator-auth/creator-auth.protocol.js";
import { CreatorService } from "../creator/creator.service.js";
import { creatorMcpServer } from "./creator-mcp.tools.js";
@Controller("creator-mcp")
export class CreatorMcpController {
  constructor(
    @Inject(CreatorAuthService) private readonly auth: CreatorAuthService,
    @Inject(CreatorService) private readonly service: CreatorService,
  ) {}
  @All()
  async handle(@Req() req: Request, @Res() res: Response) {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const reject = (status: number, message: string) =>
      res
        .status(status)
        .json({ jsonrpc: "2.0", id: null, error: { code: -32000, message } });
    if (
      req.headers.origin &&
      ![creatorMainOrigin(), "https://mcp.abeiai.com"].includes(
        req.headers.origin,
      )
    )
      return reject(403, "请求来源无效");
    let p;
    try {
      await this.auth.rateLimit(
        `mcp-ip:${req.ip ?? req.socket.remoteAddress}`,
        180,
      );
      p = await this.auth.authenticateBearer(req, CREATOR_MCP_AUDIENCE, []);
      await this.auth.rateLimit(`mcp-grant:${p.grantId}`, 120);
    } catch (error) {
      const status =
        error instanceof CreatorOAuthError ? error.getStatus() : 503;
      if (status === 401)
        res.setHeader(
          "WWW-Authenticate",
          creatorUnauthorizedChallenge(CREATOR_MCP_AUDIENCE),
        );
      return reject(
        status,
        status === 429
          ? "请求过于频繁"
          : status === 503
            ? "创作服务暂不可用"
            : "授权已失效或范围不足",
      );
    }
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return reject(405, "此无状态接口仅接受POST请求");
    }
    const server = creatorMcpServer(this.service, p);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch {
      if (!res.headersSent) return reject(500, "创作服务暂不可用");
    }
  }
}
