import { getPersonalWallet, consumePersonalCredits } from "./personal-credits.js";
import { HttpStatus, Injectable } from "@nestjs/common";
import { getPrismaClient, type Prisma } from "@xueleai/database";
import { AppException } from "../common/app-exception.js";

type LedgerEntryType = "TOP_UP" | "RESERVE" | "CONSUME" | "RELEASE" | "REFUND" | "ADMIN_ADJUST";
type LedgerListView = "all" | "source" | "consume";

const maxCopybookGenerateCredits = 500;

@Injectable()
export class WalletService {
  private readonly prisma = getPrismaClient();

  async getWallet(userId: string) {
    return this.prisma.$transaction((transaction) => getPersonalWallet(transaction, userId));
  }

  async listLedger(userId: string, options: { startDate?: string; view?: string } = {}) {
    await this.getWallet(userId);
    const entries = await this.prisma.ledgerEntry.findMany({
      where: this.ledgerWhere(userId, options),
      orderBy: {
        createdAt: "desc"
      },
      take: 50,
      include: {
        relatedOrder: true,
        relatedTask: {
          select: {
            id: true,
            status: true,
            scenario: {
              select: {
                name: true
              }
            }
          }
        }
      }
    });

    return entries.map((entry) => ({
      id: entry.id,
      userId: entry.userId,
      type: entry.type,
      typeName: entry.idempotencyKey.startsWith("referral:") ? "推荐奖励" : entry.type === "ADMIN_ADJUST" && (entry.idempotencyKey.startsWith("membership:") || entry.idempotencyKey.startsWith("membership-release-expired:"))
        ? entry.amount > 0 ? "会员赠点" : "会员点数到期"
        : this.typeName(entry.type),
      amount: entry.amount,
      balanceAfter: entry.balanceAfter,
      relatedOrderId: entry.relatedOrderId,
      relatedTaskId: entry.relatedTaskId,
      relatedAudioTaskId: entry.relatedAudioTaskId,
      relatedTaskType: entry.relatedTaskType,
      operationType: entry.operationType,
      operationTypeName: entry.operationType ? audioTaskTypeName(entry.operationType) : null,
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
    }));
  }

  private ledgerWhere(userId: string, options: { startDate?: string; view?: string }): Prisma.LedgerEntryWhereInput {
    const normalizedView = this.ledgerListView(options.view);
    const startDate = this.ledgerStartDate(options.startDate);
    const baseWhere: Prisma.LedgerEntryWhereInput = {
      userId,
      ...(startDate
        ? {
            createdAt: {
              gte: startDate
            }
          }
        : {})
    };

    if (normalizedView === "source") {
      return {
        ...baseWhere,
        amount: {
          gt: 0
        },
        type: {
          in: ["TOP_UP", "ADMIN_ADJUST"]
        }
      };
    }

    if (normalizedView === "consume") {
      return {
        ...baseWhere,
        type: "CONSUME"
      };
    }

    return {
      ...baseWhere,
      OR: [
        { type: "ADMIN_ADJUST", amount: { lt: 0 }, OR: [{ idempotencyKey: { startsWith: "membership:" } }, { idempotencyKey: { startsWith: "membership-release-expired:" } }] },
        {
          amount: {
            gt: 0
          },
          type: {
            in: ["TOP_UP", "ADMIN_ADJUST"]
          }
        },
        {
          type: "CONSUME"
        }
      ]
    };
  }

  private ledgerListView(view?: string): LedgerListView {
    if (view === "source" || view === "consume") {
      return view;
    }

    return "all";
  }

  private ledgerStartDate(value?: string) {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return null;
    }

    const date = new Date(`${value}T00:00:00.000+08:00`);

    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return date;
  }

  async consumeCopybookGenerateCreditsInTransaction(
    transaction: Prisma.TransactionClient,
    userId: string,
    copybookRecordId: unknown,
    credits?: unknown
  ) {
    const generateCredits = copybookGenerateCreditValue(credits);
    const recordId = safeIdempotencySegment(copybookRecordId);

    if (!recordId) {
      throw new AppException(40001, "字帖记录标识无效", HttpStatus.BAD_REQUEST);
    }

    const idempotencyKey = `copybook-generate:${userId}:${recordId}`;

    const existingLedger = await transaction.ledgerEntry.findUnique({
      where: {
        idempotencyKey
      }
    });

    if (
      existingLedger &&
      (existingLedger.userId !== userId ||
        existingLedger.type !== "CONSUME" ||
        existingLedger.relatedTaskType !== "COPYBOOK" ||
        Math.abs(existingLedger.amount) !== generateCredits)
    ) {
      throw new AppException(
        40901,
        "该次字帖生成请求的扣费金额不一致，请重新生成",
        HttpStatus.CONFLICT
      );
    }

    await transaction.wallet.upsert({
      where: {
        userId
      },
      update: {},
      create: {
        userId
      }
    });

    if (existingLedger) {
      const wallet = await getPersonalWallet(transaction, userId);

      return {
        credits: generateCredits,
        alreadyConsumed: true,
        wallet: this.toPublicWallet(wallet),
        ledgerEntry: this.toPublicLedgerEntry(existingLedger)
      };
    }

    const wallet = await consumePersonalCredits(transaction, userId, idempotencyKey, generateCredits);
    const ledgerEntry = await transaction.ledgerEntry.create({
      data: {
        userId,
        type: "CONSUME",
        amount: -generateCredits,
        balanceAfter: wallet.availableCredits,
        relatedTaskType: "COPYBOOK",
        idempotencyKey,
        note: `字帖生成消耗 ${generateCredits} 点`
      }
    });

    return {
      credits: generateCredits,
      alreadyConsumed: false,
      wallet: this.toPublicWallet(wallet),
      ledgerEntry: this.toPublicLedgerEntry(ledgerEntry)
    };
  }

  private typeName(type: LedgerEntryType) {
    const names: Record<LedgerEntryType, string> = {
      TOP_UP: "充值入账",
      RESERVE: "点数冻结",
      CONSUME: "点数消耗",
      RELEASE: "释放冻结",
      REFUND: "退款退回",
      ADMIN_ADJUST: "管理员调整"
    };

    return names[type];
  }

  private toPublicWallet(wallet: {
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

  private toPublicLedgerEntry(entry: {
    id: string;
    type: LedgerEntryType;
    amount: number;
    balanceAfter: number;
    note: string | null;
    createdAt: Date;
  }) {
    return {
      id: entry.id,
      type: entry.type,
      typeName: this.typeName(entry.type),
      amount: entry.amount,
      balanceAfter: entry.balanceAfter,
      note: entry.note,
      createdAt: entry.createdAt
    };
  }
}

function audioTaskTypeName(type: string) {
  const names: Record<string, string> = {
    TTS: "语音合成",
    VOICE_CLONE: "声音复刻",
    VOICE_DESIGN: "声音设计"
  };

  return names[type] ?? type;
}

function safeIdempotencySegment(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const segment = value.trim();

  return /^[a-zA-Z0-9_-]{8,80}$/.test(segment) ? segment : null;
}

export function copybookGenerateCreditValue(value: unknown) {
  const credits = typeof value === "number" ? value : Number(value ?? 2);

  if (!Number.isInteger(credits) || credits < 1 || credits > maxCopybookGenerateCredits) {
    throw new AppException(40001, "请重新确认本次生成字帖的点数消耗", HttpStatus.BAD_REQUEST);
  }

  return credits;
}
