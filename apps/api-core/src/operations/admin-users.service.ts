import { randomUUID } from "node:crypto";
import { HttpStatus, Injectable } from "@nestjs/common";
import { getPrismaClient, type Prisma } from "@xueleai/database";
import { AppException } from "../common/app-exception.js";
import { adminUserFilters } from "./admin-user-query.js";
import { AdjustUserCreditsDto, RechargeUserCreditsDto } from "./dto/admin-user.dto.js";

type UserStatus = "ACTIVE" | "DISABLED";

@Injectable()
export class AdminUsersService {
  private readonly prisma = getPrismaClient();

  async listUsers() {
    return (await this.listUsersPage({ pageSize: "100" })).items;
  }

  async listUsersPage(query: Record<string, unknown> = {}) {
    const { where, page: requestedPage, pageSize } = adminUserFilters(query);
    return this.prisma.$transaction(async (tx) => {
      const total = await tx.user.count({ where });
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const page = Math.min(requestedPage, totalPages);
      const users = await tx.user.findMany({
        where,
        select: {
          id: true, email: true, nickname: true, status: true,
          createdAt: true, lastLoginAt: true,
          wallet: { select: { availableCredits: true, frozenCredits: true } }
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize
      });
      const items = users.map((user) => ({
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        status: user.status,
        statusName: this.statusName(user.status),
        availableCredits: user.wallet?.availableCredits ?? 0,
        frozenCredits: user.wallet?.frozenCredits ?? 0,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt
      }));
      return { items, total, page, pageSize, totalPages };
    }, { isolationLevel: "RepeatableRead" });
  }

  async getUserDetail(id: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        id
      },
      include: {
        wallet: true,
        paymentOrders: {
          orderBy: {
            createdAt: "desc"
          },
          take: 30
        },
        ledgerEntries: {
          include: {
            relatedOrder: true,
            relatedTask: {
              include: {
                scenario: true
              }
            }
          },
          orderBy: {
            createdAt: "desc"
          },
          take: 100
        },
        aiTasks: {
          include: {
            scenario: true,
            reservation: true
          },
          orderBy: {
            createdAt: "desc"
          },
          take: 30
        }
      }
    });

    if (!user) {
      throw new AppException(40401, "用户不存在", HttpStatus.NOT_FOUND);
    }

    const wallet =
      user.wallet ??
      (await this.prisma.wallet.create({
        data: {
          userId: user.id
        }
      }));

    const ledgerEntries = user.ledgerEntries.map((entry) => this.toLedgerEntry(entry));

    return {
      user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        status: user.status,
        statusName: this.statusName(user.status),
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastLoginAt: user.lastLoginAt
      },
      wallet: this.toWallet(wallet),
      paymentOrders: user.paymentOrders.map((order) => this.toPaymentOrder(order)),
      rechargeRecords: ledgerEntries.filter((entry) => entry.type === "TOP_UP"),
      consumeRecords: ledgerEntries.filter(
        (entry) => entry.type === "CONSUME" || (entry.type === "ADMIN_ADJUST" && entry.amount < 0)
      ),
      ledgerEntries,
      aiTasks: user.aiTasks.map((task) => ({
        id: task.id,
        scenarioId: task.scenarioId,
        scenarioName: task.scenario.name,
        status: task.status,
        statusName: this.aiTaskStatusName(task.status),
        estimatedCredits: task.estimatedCredits,
        actualCredits: task.actualCredits,
        providerName: task.providerName,
        modelName: task.modelName,
        inputTokens: task.inputTokens,
        outputTokens: task.outputTokens,
        totalTokens: task.totalTokens,
        errorMessage: task.errorMessage,
        createdAt: task.createdAt,
        finishedAt: task.finishedAt,
        reservation: task.reservation
          ? {
              id: task.reservation.id,
              amount: task.reservation.amount,
              status: task.reservation.status
            }
          : null
      }))
    };
  }

  async rechargeCredits(id: string, dto: RechargeUserCreditsDto) {
    const amount = dto.amount;
    const note = this.adminRechargeNote(dto);

    if (!Number.isInteger(amount) || amount <= 0) {
      throw new AppException(40001, "充值点数必须为正整数", HttpStatus.BAD_REQUEST);
    }

    const result = await this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.findUnique({
        where: {
          id
        }
      });

      if (!user) {
        throw new AppException(40401, "用户不存在", HttpStatus.NOT_FOUND);
      }

      await this.ensureWallet(transaction, id);
      const wallet = await transaction.wallet.update({
        where: {
          userId: id
        },
        data: {
          availableCredits: {
            increment: amount
          },
          totalTopUpCredits: {
            increment: amount
          }
        }
      });

      const ledgerEntry = await transaction.ledgerEntry.create({
        data: {
          userId: id,
          type: "TOP_UP",
          amount,
          balanceAfter: wallet.availableCredits,
          idempotencyKey: `admin-recharge:${id}:${Date.now()}:${randomUUID()}`,
          note
        }
      });

      return {
        user,
        wallet,
        ledgerEntry
      };
    });

    return {
      user: {
        id: result.user.id,
        email: result.user.email,
        nickname: result.user.nickname,
        status: result.user.status,
        statusName: this.statusName(result.user.status)
      },
      wallet: this.toWallet(result.wallet),
      ledgerEntry: this.toLedgerEntry(result.ledgerEntry)
    };
  }

  async updateStatus(id: string, status: UserStatus) {
    const user = await this.prisma.user.findUnique({
      where: {
        id
      }
    });

    if (!user) {
      throw new AppException(40401, "用户不存在", HttpStatus.NOT_FOUND);
    }

    const updatedUser = await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.user.update({
        where: {
          id
        },
        data: {
          status
        },
        include: {
          wallet: true
        }
      });

      if (status === "DISABLED") {
        await transaction.refreshToken.updateMany({
          where: {
            userId: id,
            type: "USER",
            revokedAt: null
          },
          data: {
            revokedAt: new Date()
          }
        });
      }

      return updated;
    });

    return {
      id: updatedUser.id,
      email: updatedUser.email,
      nickname: updatedUser.nickname,
      status: updatedUser.status,
      statusName: this.statusName(updatedUser.status),
      availableCredits: updatedUser.wallet?.availableCredits ?? 0,
      frozenCredits: updatedUser.wallet?.frozenCredits ?? 0,
      createdAt: updatedUser.createdAt,
      lastLoginAt: updatedUser.lastLoginAt
    };
  }

  async adjustCredits(id: string, dto: AdjustUserCreditsDto) {
    const amount = dto.amount;
    const reason = dto.reason.trim();

    if (!Number.isInteger(amount) || amount === 0) {
      throw new AppException(40001, "调整点数必须为非零整数", HttpStatus.BAD_REQUEST);
    }

    if (!reason) {
      throw new AppException(40001, "调整原因不能为空", HttpStatus.BAD_REQUEST);
    }

    const result = await this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.findUnique({
        where: {
          id
        }
      });

      if (!user) {
        throw new AppException(40401, "用户不存在", HttpStatus.NOT_FOUND);
      }

      await this.ensureWallet(transaction, id);

      if (amount < 0) {
        const changed = await transaction.wallet.updateMany({
          where: {
            userId: id,
            availableCredits: {
              gte: Math.abs(amount)
            }
          },
          data: {
            availableCredits: {
              increment: amount
            }
          }
        });

        if (changed.count === 0) {
          throw new AppException(40004, "可用点数不足，不能扣成负数", HttpStatus.BAD_REQUEST);
        }
      } else {
        await transaction.wallet.update({
          where: {
            userId: id
          },
          data: {
            availableCredits: {
              increment: amount
            }
          }
        });
      }

      const wallet = await transaction.wallet.findUniqueOrThrow({
        where: {
          userId: id
        }
      });

      const ledgerEntry = await transaction.ledgerEntry.create({
        data: {
          userId: id,
          type: "ADMIN_ADJUST",
          amount,
          balanceAfter: wallet.availableCredits,
          idempotencyKey: `admin-adjust:${id}:${Date.now()}:${randomUUID()}`,
          note: reason
        }
      });

      return {
        user,
        wallet,
        ledgerEntry
      };
    });

    return {
      user: {
        id: result.user.id,
        email: result.user.email,
        nickname: result.user.nickname,
        status: result.user.status,
        statusName: this.statusName(result.user.status)
      },
      wallet: this.toWallet(result.wallet),
      ledgerEntry: this.toLedgerEntry(result.ledgerEntry)
    };
  }

  private async ensureWallet(transaction: Prisma.TransactionClient, userId: string) {
    return transaction.wallet.upsert({
      where: {
        userId
      },
      update: {},
      create: {
        userId
      }
    });
  }

  private toWallet(wallet: {
    id: string;
    userId: string;
    availableCredits: number;
    frozenCredits: number;
    totalTopUpCredits: number;
    totalConsumedCredits: number;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: wallet.id,
      userId: wallet.userId,
      availableCredits: wallet.availableCredits,
      frozenCredits: wallet.frozenCredits,
      totalTopUpCredits: wallet.totalTopUpCredits,
      totalConsumedCredits: wallet.totalConsumedCredits,
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt
    };
  }

  private toPaymentOrder(order: {
    id: string;
    orderNo: string;
    provider: string;
    amountCny: { toString(): string };
    credits: number;
    status: string;
    providerTradeNo: string | null;
    paidAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: order.id,
      orderNo: order.orderNo,
      provider: order.provider,
      providerName: order.provider === "ALIPAY" ? "支付宝" : "微信支付",
      amountCny: order.amountCny.toString(),
      credits: order.credits,
      status: order.status,
      statusName: this.paymentStatusName(order.status),
      providerTradeNo: order.providerTradeNo,
      paidAt: order.paidAt,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt
    };
  }

  private toLedgerEntry(entry: {
    id: string;
    userId: string;
    type: string;
    amount: number;
    balanceAfter: number;
    relatedOrderId: string | null;
    relatedTaskId: string | null;
    idempotencyKey: string;
    note: string | null;
    createdAt: Date;
    relatedOrder?: {
      id: string;
      orderNo: string;
      provider: string;
      amountCny: { toString(): string };
      credits: number;
      status: string;
    } | null;
    relatedTask?: {
      id: string;
      status: string;
      scenario?: {
        name: string;
      };
    } | null;
  }) {
    return {
      id: entry.id,
      userId: entry.userId,
      type: entry.type,
      typeName: this.ledgerTypeName(entry.type),
      amount: entry.amount,
      balanceAfter: entry.balanceAfter,
      relatedOrderId: entry.relatedOrderId,
      relatedTaskId: entry.relatedTaskId,
      idempotencyKey: entry.idempotencyKey,
      note: entry.note,
      createdAt: entry.createdAt,
      relatedOrder: entry.relatedOrder
        ? {
            id: entry.relatedOrder.id,
            orderNo: entry.relatedOrder.orderNo,
            provider: entry.relatedOrder.provider,
            amountCny: entry.relatedOrder.amountCny.toString(),
            credits: entry.relatedOrder.credits,
            status: entry.relatedOrder.status
          }
        : null,
      relatedTask: entry.relatedTask
        ? {
            id: entry.relatedTask.id,
            status: entry.relatedTask.status,
            scenarioName: entry.relatedTask.scenario?.name ?? null
          }
        : null
    };
  }

  private statusName(status: string) {
    return status === "ACTIVE" ? "正常" : "已禁用";
  }

  private paymentStatusName(status: string) {
    const names: Record<string, string> = {
      CREATED: "已创建",
      PAYING: "支付中",
      PAID: "已支付",
      CLOSED: "已关闭",
      FAILED: "支付失败"
    };

    return names[status] ?? status;
  }

  private ledgerTypeName(type: string) {
    const names: Record<string, string> = {
      TOP_UP: "充值入账",
      RESERVE: "点数冻结",
      CONSUME: "点数消耗",
      RELEASE: "释放冻结",
      REFUND: "退款退回",
      ADMIN_ADJUST: "管理员调整"
    };

    return names[type] ?? type;
  }

  private adminRechargeNote(dto: RechargeUserCreditsDto) {
    const reason = dto.reason?.trim() ?? "";
    const reasonNames: Record<RechargeUserCreditsDto["reasonType"], string> = {
      TEST: "测试",
      REWARD: "奖励",
      COMPENSATION: "补偿",
      OTHER: "其他"
    };

    if (dto.reasonType === "OTHER" && reason.length < 2) {
      throw new AppException(40001, "请选择其他原因时，请填写具体说明", HttpStatus.BAD_REQUEST);
    }

    const reasonName = reasonNames[dto.reasonType];

    return dto.reasonType === "OTHER" ? `管理员充值：${reason}` : `管理员充值：${reasonName}`;
  }

  private aiTaskStatusName(status: string) {
    const names: Record<string, string> = {
      CREATED: "已创建",
      RESERVED: "已冻结点数",
      RUNNING: "生成中",
      SUCCEEDED: "已完成",
      FAILED: "失败",
      CANCELLED: "已取消",
      COMPENSATED: "已补偿"
    };

    return names[status] ?? status;
  }
}
