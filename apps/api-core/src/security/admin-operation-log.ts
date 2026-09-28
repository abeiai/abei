import { Logger } from "@nestjs/common";
import { getPrismaClient } from "@xueleai/database";
import { getClientIp, getUserAgent, type HeaderRequestLike } from "./request-types.js";

const logger = new Logger("AdminOperationLog");
const prisma = getPrismaClient();

interface AdminOperationLogInput {
  adminUserId: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  description: string;
  request?: HeaderRequestLike;
}

export async function writeAdminOperationLog(input: AdminOperationLogInput) {
  try {
    await prisma.adminOperationLog.create({
      data: {
        adminUserId: input.adminUserId,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId ?? null,
        description: input.description,
        ip: input.request ? getClientIp(input.request) : null,
        userAgent: input.request ? getUserAgent(input.request) : null
      }
    });
  } catch (error) {
    logger.error(
      JSON.stringify({
        message: "管理员操作日志写入失败",
        action: input.action,
        resourceType: input.resourceType,
        error: error instanceof Error ? error.message : String(error)
      })
    );
  }
}
