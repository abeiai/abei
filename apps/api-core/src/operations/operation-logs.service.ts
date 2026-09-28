import { Injectable } from "@nestjs/common";
import { getPrismaClient } from "@xueleai/database";

export interface OperationLogFilters {
  adminUserId?: string;
  resourceType?: string;
  resourceId?: string;
  startedAt?: string;
  endedAt?: string;
}

@Injectable()
export class OperationLogsService {
  private readonly prisma = getPrismaClient();

  async listLogs(filters: OperationLogFilters) {
    const createdAt = this.dateFilter(filters.startedAt, filters.endedAt);

    const logs = await this.prisma.adminOperationLog.findMany({
      where: {
        adminUserId: filters.adminUserId || undefined,
        resourceType: filters.resourceType || undefined,
        resourceId: filters.resourceId || undefined,
        createdAt
      },
      include: {
        adminUser: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 200
    });

    return logs.map((log) => ({
      id: log.id,
      adminUserId: log.adminUserId,
      adminUser: log.adminUser,
      action: log.action,
      actionName: this.actionName(log.action),
      resourceType: log.resourceType,
      resourceId: log.resourceId,
      description: log.description,
      ip: log.ip,
      userAgent: log.userAgent,
      createdAt: log.createdAt
    }));
  }

  async listAdmins() {
    return this.prisma.adminUser.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 100
    });
  }

  private dateFilter(startedAt?: string, endedAt?: string) {
    const filter: {
      gte?: Date;
      lte?: Date;
    } = {};

    const start = this.parseDate(startedAt);
    const end = this.parseDate(endedAt, true);

    if (start) {
      filter.gte = start;
    }

    if (end) {
      filter.lte = end;
    }

    return Object.keys(filter).length > 0 ? filter : undefined;
  }

  private parseDate(value?: string, endOfDay = false) {
    if (!value) {
      return undefined;
    }

    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      return undefined;
    }

    if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      parsed.setHours(23, 59, 59, 999);
    }

    return parsed;
  }

  private actionName(action: string) {
    const names: Record<string, string> = {
      ADMIN_LOGIN: "管理员登录",
      CREATE_CATEGORY: "创建分类",
      UPDATE_CATEGORY: "更新分类",
      DELETE_CATEGORY: "删除分类",
      CREATE_ARTICLE: "创建文章",
      UPDATE_ARTICLE: "更新文章",
      DELETE_ARTICLE: "删除文章",
      PUBLISH_ARTICLE: "发布文章",
      ARCHIVE_ARTICLE: "归档文章",
      CREATE_TAG: "创建标签",
      UPDATE_TAG: "更新标签",
      DELETE_TAG: "删除标签",
      UPLOAD_MEDIA: "上传媒体",
      PUBLISH_DUE_CONTENT: "执行定时发布",
      CREATE_PAGE: "创建单页",
      UPDATE_PAGE: "更新单页",
      DELETE_PAGE: "删除单页",
      PUBLISH_PAGE: "发布单页",
      ARCHIVE_PAGE: "归档单页",
      SYNC_PAYMENT_ORDER: "同步支付订单",
      SUPPLEMENT_PAYMENT_ORDER: "手动补单",
      CREATE_BILLING_PRODUCT: "创建充值产品",
      UPDATE_BILLING_PRODUCT: "更新充值产品",
      DELETE_BILLING_PRODUCT: "删除充值产品",
      CREATE_AI_PROVIDER: "创建 AI Provider",
      UPDATE_AI_PROVIDER: "更新 AI Provider",
      UPDATE_USER_STATUS: "更新用户状态",
      ADMIN_ADJUST_CREDITS: "管理员调整点数",
      ADMIN_RECHARGE_CREDITS: "管理员充值点数",
      UPDATE_SYSTEM_CONFIG: "更新系统设置"
    };

    return names[action] ?? action;
  }
}
