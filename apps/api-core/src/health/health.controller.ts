import { createConnection } from "node:net";
import { Controller, Get, HttpStatus } from "@nestjs/common";
import { getPrismaClient } from "@xueleai/database";
import { AppException } from "../common/app-exception.js";
import { successResponse, type ApiResponse } from "../common/api-response.js";

interface HealthPayload {
  service: "api-core";
  status: "ok";
  version: string;
  revision: string;
}

@Controller("health")
export class HealthController {
  private readonly prisma = getPrismaClient();

  @Get()
  getHealth(): ApiResponse<HealthPayload> {
    return successResponse({
      service: "api-core",
      status: "ok",
      version: process.env.APP_VERSION ?? "0.0.0",
      revision: process.env.APP_RELEASE_SHA ?? "unknown"
    });
  }

  @Get("db")
  async getDatabaseHealth() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;

      return successResponse({
        status: "ok"
      });
    } catch {
      throw new AppException(50301, "数据库连接异常", HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  @Get("redis")
  async getRedisHealth() {
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
      throw new AppException(50302, "Redis 配置缺失", HttpStatus.SERVICE_UNAVAILABLE);
    }

    const status = await pingRedis(redisUrl);

    if (status !== "ok") {
      throw new AppException(50302, "Redis 连接异常", HttpStatus.SERVICE_UNAVAILABLE);
    }

    return successResponse({
      status
    });
  }
}

async function pingRedis(redisUrl: string): Promise<"ok" | "error"> {
  return new Promise((resolve) => {
    const url = new URL(redisUrl);
    const socket = createConnection({
      host: url.hostname,
      port: Number(url.port || 3325)
    });
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve("error");
    }, 2000);

    socket.once("connect", () => {
      socket.write("*1\r\n$4\r\nPING\r\n");
    });
    socket.once("data", (data) => {
      clearTimeout(timeout);
      socket.end();
      resolve(data.toString("utf8").includes("PONG") ? "ok" : "error");
    });
    socket.once("error", () => {
      clearTimeout(timeout);
      socket.destroy();
      resolve("error");
    });
  });
}
