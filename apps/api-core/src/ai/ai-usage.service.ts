import { HttpStatus, Injectable } from "@nestjs/common";
import { getPrismaClient, type Prisma } from "@xueleai/database";
import { AppException } from "../common/app-exception.js";
import { estimateTokenCost, normalizeModelPricingConfig } from "./model-pricing.js";

const shanghaiOffsetMs = 8 * 60 * 60 * 1000;

interface UsageFilters {
  from?: string;
  to?: string;
  providerId?: string;
  modelId?: string;
}

interface UsageBucket {
  date: string;
  dimensionKey: string;
  providerId: string | null;
  modelId: string | null;
  providerInstanceId: string | null;
  modelInstanceId: string | null;
  scenarioId: string | null;
  toolId: string | null;
  userId: string | null;
  providerName: string | null;
  modelName: string | null;
  scenarioName: string | null;
  toolName: string | null;
  userEmail: string | null;
  requestCount: number;
  successCount: number;
  failureCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  consumedCredits: number;
  estimatedCost: number;
  latencyTotal: number;
  latencyCount: number;
}

@Injectable()
export class AiUsageService {
  private readonly prisma = getPrismaClient();

  async aggregateDaily(filters: UsageFilters = {}) {
    const range = normalizeDateRange(filters, 7);
    const logs = await this.prisma.aiCallLog.findMany({
      where: {
        createdAt: {
          gte: range.startAt,
          lt: range.endAt
        }
      },
      include: {
        aiProvider: true,
        aiModel: true,
        providerInstance: {
          include: {
            providerPreset: true
          }
        },
        modelInstance: true,
        task: {
          include: {
            user: {
              select: {
                id: true,
                email: true
              }
            },
            scenario: {
              include: {
                toolCategory: true
              }
            }
          }
        }
      }
    });
    const buckets = new Map<string, UsageBucket>();
    const creditedTasks = new Set<string>();

    for (const log of logs) {
      const task = log.task;
      const scenario = task.scenario;
      const providerName = log.providerInstance?.name ?? log.aiProvider?.name ?? log.provider;
      const modelName = log.modelInstance?.displayName ?? log.aiModel?.displayName ?? log.model;
      const date = dateKeyInShanghai(log.createdAt);
      const providerKey = log.providerInstanceId ?? log.providerId ?? providerName;
      const modelKey = log.modelInstanceId ?? log.modelId ?? modelName;
      const scenarioKey = scenario?.id ?? "none";
      const userKey = task.userId ?? "none";
      const dimensionKey = [date, providerKey, modelKey, scenarioKey, userKey].join("|");
      const bucket =
        buckets.get(dimensionKey) ??
        createBucket({
          date,
          dimensionKey,
          providerId: log.providerId,
          modelId: log.modelId,
          providerInstanceId: log.providerInstanceId,
          modelInstanceId: log.modelInstanceId,
          scenarioId: scenario?.id ?? null,
          toolId: scenario?.id ?? null,
          userId: task.userId,
          providerName,
          modelName,
          scenarioName: scenario?.name ?? null,
          toolName: scenario?.name ?? null,
          userEmail: task.user?.email ?? null
        });

      bucket.requestCount += 1;
      bucket.successCount += log.success ? 1 : 0;
      bucket.failureCount += log.success ? 0 : 1;
      bucket.inputTokens += positiveInt(log.inputTokens);
      bucket.outputTokens += positiveInt(log.outputTokens);
      bucket.totalTokens += positiveInt(log.totalTokens);

      if (log.latencyMs && log.latencyMs > 0) {
        bucket.latencyTotal += log.latencyMs;
        bucket.latencyCount += 1;
      }

      if (log.success) {
        const creditKey = `${dimensionKey}:${task.id}`;

        if (!creditedTasks.has(creditKey)) {
          bucket.consumedCredits += positiveInt(task.actualCredits);
          creditedTasks.add(creditKey);
        }
      }

      bucket.estimatedCost += estimateTokenCost({
        usage: {
          inputTokens: positiveInt(log.inputTokens),
          outputTokens: positiveInt(log.outputTokens),
          totalTokens: positiveInt(log.totalTokens)
        },
        pricingConfig: normalizeModelPricingConfig(log.modelInstance?.pricingConfig),
        pricingUnit: log.modelInstance?.pricingUnit,
        inputPrice: decimalNumber(log.modelInstance?.inputPrice ?? log.aiModel?.inputPrice),
        outputPrice: decimalNumber(log.modelInstance?.outputPrice ?? log.aiModel?.outputPrice)
      }) ?? 0;
      buckets.set(dimensionKey, bucket);
    }

    await this.prisma.aiUsageDailyStat.deleteMany({
      where: {
        date: {
          gte: dateOnly(range.from),
          lte: dateOnly(range.to)
        }
      }
    });

    const now = new Date();
    const rows = Array.from(buckets.values()).map((bucket) => ({
      date: dateOnly(bucket.date),
      dimensionKey: bucket.dimensionKey,
      providerId: bucket.providerId,
      modelId: bucket.modelId,
      providerInstanceId: bucket.providerInstanceId,
      modelInstanceId: bucket.modelInstanceId,
      scenarioId: bucket.scenarioId,
      toolId: bucket.toolId,
      userId: bucket.userId,
      providerName: bucket.providerName,
      modelName: bucket.modelName,
      scenarioName: bucket.scenarioName,
      toolName: bucket.toolName,
      userEmail: bucket.userEmail,
      requestCount: bucket.requestCount,
      successCount: bucket.successCount,
      failureCount: bucket.failureCount,
      inputTokens: bucket.inputTokens,
      outputTokens: bucket.outputTokens,
      totalTokens: bucket.totalTokens,
      consumedCredits: bucket.consumedCredits,
      estimatedCost: bucket.estimatedCost.toFixed(4),
      avgLatencyMs:
        bucket.latencyCount > 0 ? Math.round(bucket.latencyTotal / bucket.latencyCount) : null,
      createdAt: now,
      updatedAt: now
    }));

    if (rows.length > 0) {
      await this.prisma.aiUsageDailyStat.createMany({
        data: rows
      });
    }

    await this.generateAlerts(range);

    return {
      from: range.from,
      to: range.to,
      scannedCallLogs: logs.length,
      statRows: rows.length
    };
  }

  async getDashboard(filters: UsageFilters = {}) {
    const range = normalizeDateRange(filters, 7);
    await this.aggregateDaily({
      from: range.from,
      to: range.to
    });

    const baseWhere: Prisma.AiUsageDailyStatWhereInput = {
      date: {
        gte: dateOnly(range.from),
        lte: dateOnly(range.to)
      }
    };
    const optionRows = await this.prisma.aiUsageDailyStat.findMany({
      where: baseWhere,
      orderBy: [
        {
          date: "asc"
        },
        {
          requestCount: "desc"
        }
      ]
    });
    const rows = await this.prisma.aiUsageDailyStat.findMany({
      where: usageWhere(range, filters),
      orderBy: [
        {
          date: "asc"
        },
        {
          requestCount: "desc"
        }
      ]
    });
    const todayKey = dateKeyInShanghai(new Date());
    const todayRows = rows.filter((row) => dateKeyFromDateOnly(row.date) === todayKey);
    const total = summarizeRows(rows);
    const today = summarizeRows(todayRows);

    return {
      filters: {
        from: range.from,
        to: range.to,
        providerId: filters.providerId ?? "",
        modelId: filters.modelId ?? ""
      },
      total,
      today,
      top: {
        mostUsedModel: topMetric(rows, "model", "requestCount"),
        mostCostlyModel: topMetric(rows, "model", "estimatedCost"),
        mostUsedTool: topMetric(rows, "tool", "requestCount")
      },
      byProvider: groupUsageRows(rows, "provider"),
      byModel: groupUsageRows(rows, "model"),
      byTool: groupUsageRows(rows, "tool"),
      trend: range.keys.map((date) => ({
        date,
        ...summarizeRows(rows.filter((row) => dateKeyFromDateOnly(row.date) === date))
      })),
      providers: uniqueOptions(optionRows, "provider"),
      models: uniqueOptions(optionRows, "model"),
      updatedAt: new Date()
    };
  }

  async listAlerts(status = "OPEN") {
    const normalizedStatus = status === "RESOLVED" ? "RESOLVED" : status === "ALL" ? undefined : "OPEN";
    const alerts = await this.prisma.systemAlert.findMany({
      where: normalizedStatus
        ? {
            status: normalizedStatus
          }
        : undefined,
      orderBy: {
        createdAt: "desc"
      },
      take: 100
    });

    return alerts.map((alert) => ({
      id: alert.id,
      type: alert.type,
      typeName: alertTypeName(alert.type),
      level: alert.level,
      levelName: alertLevelName(alert.level),
      title: alert.title,
      message: alert.message,
      status: alert.status,
      statusName: alert.status === "RESOLVED" ? "已处理" : "未处理",
      relatedResourceType: alert.relatedResourceType,
      relatedResourceId: alert.relatedResourceId,
      createdAt: alert.createdAt,
      resolvedAt: alert.resolvedAt,
      resolvedByAdminId: alert.resolvedByAdminId
    }));
  }

  async resolveAlert(id: string, adminUserId: string) {
    const alert = await this.prisma.systemAlert.findUnique({
      where: {
        id
      }
    });

    if (!alert) {
      throw new AppException(40401, "系统告警不存在", HttpStatus.NOT_FOUND);
    }

    if (alert.status === "RESOLVED") {
      return (await this.listAlerts("ALL")).find((item) => item.id === id) ?? alert;
    }

    await this.prisma.systemAlert.update({
      where: {
        id
      },
      data: {
        status: "RESOLVED",
        resolvedAt: new Date(),
        resolvedByAdminId: adminUserId
      }
    });

    return (await this.listAlerts("ALL")).find((item) => item.id === id);
  }

  private async generateAlerts(range: NormalizedDateRange) {
    const stats = await this.prisma.aiUsageDailyStat.findMany({
      where: {
        date: {
          gte: dateOnly(range.from),
          lte: dateOnly(range.to)
        }
      }
    });
    const failedProviders = await this.prisma.aiProviderInstance.findMany({
      where: {
        status: "TEST_FAILED"
      },
      include: {
        providerPreset: true
      }
    });

    for (const provider of failedProviders) {
      await this.upsertAlert({
        type: "PROVIDER_UNAVAILABLE",
        level: "ERROR",
        title: "Provider 不可用",
        message: `${provider.name || provider.providerPreset.displayName} 最近连接测试失败，请检查 Base URL、API Key 或模型名称。`,
        fingerprint: `provider-unavailable:${provider.id}`,
        relatedResourceType: "AI_PROVIDER_INSTANCE",
        relatedResourceId: provider.id
      });
    }

    for (const provider of groupStatRows(stats, "provider")) {
      const summary = summarizeRows(provider.rows);

      if (summary.requestCount >= 3 && summary.failureRate >= 50) {
        await this.upsertAlert({
          type: "FAILURE_RATE_HIGH",
          level: "WARNING",
          title: "失败率过高",
          message: `${provider.name} 在 ${range.from} 至 ${range.to} 的失败率为 ${summary.failureRate.toFixed(1)}%。`,
          fingerprint: `failure-rate:${range.from}:${range.to}:${provider.id}`,
          relatedResourceType: "AI_PROVIDER",
          relatedResourceId: provider.id
        });
      }

      if (summary.requestCount >= 3 && summary.avgLatencyMs >= 8000) {
        await this.upsertAlert({
          type: "LATENCY_HIGH",
          level: "WARNING",
          title: "模型调用延迟偏高",
          message: `${provider.name} 平均耗时 ${summary.avgLatencyMs} ms，建议检查 Provider 可用性。`,
          fingerprint: `latency-high:${range.from}:${range.to}:${provider.id}`,
          relatedResourceType: "AI_PROVIDER",
          relatedResourceId: provider.id
        });
      }
    }

    for (const model of groupStatRows(stats, "model")) {
      const summary = summarizeRows(model.rows);

      if (summary.estimatedCost >= 100 || summary.consumedCredits >= 1000) {
        await this.upsertAlert({
          type: "COST_HIGH",
          level: "WARNING",
          title: "模型估算成本偏高",
          message: `${model.name} 在当前区间估算成本 ${summary.estimatedCost.toFixed(4)}，消耗 ${summary.consumedCredits} 点。`,
          fingerprint: `cost-high:${range.from}:${range.to}:${model.id}`,
          relatedResourceType: "AI_MODEL",
          relatedResourceId: model.id
        });
      }
    }

    for (const user of groupStatRows(stats, "user")) {
      const summary = summarizeRows(user.rows);

      if (summary.consumedCredits >= 1000) {
        await this.upsertAlert({
          type: "USER_ABNORMAL_CONSUMPTION",
          level: "WARNING",
          title: "用户消耗异常",
          message: `${user.name} 在当前区间消耗 ${summary.consumedCredits} 点，请确认是否符合预期。`,
          fingerprint: `user-consumption:${range.from}:${range.to}:${user.id}`,
          relatedResourceType: "USER",
          relatedResourceId: user.id
        });
      }
    }

    const paymentAnomalies = await this.prisma.paymentNotifyLog.findMany({
      where: {
        createdAt: {
          gte: range.startAt,
          lt: range.endAt
        },
        OR: [
          {
            verifyResult: {
              not: "SUCCESS"
            }
          },
          {
            processResult: {
              notIn: ["CREDITED", "DUPLICATE"]
            }
          }
        ]
      },
      take: 20
    });

    for (const log of paymentAnomalies) {
      await this.upsertAlert({
        type: "PAYMENT_CREDIT_ANOMALY",
        level: "ERROR",
        title: "支付点数入账异常",
        message: `支付回调 ${log.orderNo ?? log.id} 校验结果 ${log.verifyResult}，处理结果 ${log.processResult}。`,
        fingerprint: `payment-anomaly:${log.id}`,
        relatedResourceType: "PAYMENT_NOTIFY_LOG",
        relatedResourceId: log.id
      });
    }
  }

  private async upsertAlert(input: {
    type: string;
    level: string;
    title: string;
    message: string;
    fingerprint: string;
    relatedResourceType?: string | null;
    relatedResourceId?: string | null;
  }) {
    const existing = await this.prisma.systemAlert.findUnique({
      where: {
        fingerprint: input.fingerprint
      }
    });

    if (existing?.status === "RESOLVED") {
      return;
    }

    if (existing) {
      await this.prisma.systemAlert.update({
        where: {
          fingerprint: input.fingerprint
        },
        data: {
          level: input.level,
          title: input.title,
          message: input.message,
          relatedResourceType: input.relatedResourceType ?? null,
          relatedResourceId: input.relatedResourceId ?? null
        }
      });
      return;
    }

    await this.prisma.systemAlert.create({
      data: {
        type: input.type,
        level: input.level,
        title: input.title,
        message: input.message,
        fingerprint: input.fingerprint,
        relatedResourceType: input.relatedResourceType ?? null,
        relatedResourceId: input.relatedResourceId ?? null
      }
    });
  }
}

interface NormalizedDateRange {
  from: string;
  to: string;
  startAt: Date;
  endAt: Date;
  keys: string[];
}

function normalizeDateRange(filters: UsageFilters, defaultDays: number): NormalizedDateRange {
  const today = dateKeyInShanghai(new Date());
  const to = normalizeDateKey(filters.to) ?? today;
  const from = normalizeDateKey(filters.from) ?? addDays(to, -(defaultDays - 1));
  const orderedFrom = from <= to ? from : to;
  const orderedTo = from <= to ? to : from;
  const keys: string[] = [];
  let cursor = orderedFrom;

  while (cursor <= orderedTo && keys.length < 366) {
    keys.push(cursor);
    cursor = addDays(cursor, 1);
  }

  return {
    from: orderedFrom,
    to: orderedTo,
    startAt: shanghaiStart(orderedFrom),
    endAt: shanghaiStart(addDays(orderedTo, 1)),
    keys
  };
}

function usageWhere(range: NormalizedDateRange, filters: UsageFilters): Prisma.AiUsageDailyStatWhereInput {
  const and: Prisma.AiUsageDailyStatWhereInput[] = [
    {
      date: {
        gte: dateOnly(range.from),
        lte: dateOnly(range.to)
      }
    }
  ];

  if (filters.providerId) {
    and.push({
      OR: [
        {
          providerId: filters.providerId
        },
        {
          providerInstanceId: filters.providerId
        }
      ]
    });
  }

  if (filters.modelId) {
    and.push({
      OR: [
        {
          modelId: filters.modelId
        },
        {
          modelInstanceId: filters.modelId
        }
      ]
    });
  }

  return {
    AND: and
  };
}

function createBucket(input: Omit<UsageBucket, "requestCount" | "successCount" | "failureCount" | "inputTokens" | "outputTokens" | "totalTokens" | "consumedCredits" | "estimatedCost" | "latencyTotal" | "latencyCount">): UsageBucket {
  return {
    ...input,
    requestCount: 0,
    successCount: 0,
    failureCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    consumedCredits: 0,
    estimatedCost: 0,
    latencyTotal: 0,
    latencyCount: 0
  };
}

function summarizeRows(rows: Array<{
  requestCount: number;
  successCount: number;
  failureCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  consumedCredits: number;
  estimatedCost: { toString(): string } | string | number;
  avgLatencyMs: number | null;
}>) {
  const total = rows.reduce(
    (acc, row) => {
      acc.requestCount += row.requestCount;
      acc.successCount += row.successCount;
      acc.failureCount += row.failureCount;
      acc.inputTokens += row.inputTokens;
      acc.outputTokens += row.outputTokens;
      acc.totalTokens += row.totalTokens;
      acc.consumedCredits += row.consumedCredits;
      acc.estimatedCost += decimalNumber(row.estimatedCost);

      if (row.avgLatencyMs && row.requestCount > 0) {
        acc.latencyWeighted += row.avgLatencyMs * row.requestCount;
        acc.latencyWeight += row.requestCount;
      }

      return acc;
    },
    {
      requestCount: 0,
      successCount: 0,
      failureCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      consumedCredits: 0,
      estimatedCost: 0,
      latencyWeighted: 0,
      latencyWeight: 0
    }
  );

  return {
    requestCount: total.requestCount,
    successCount: total.successCount,
    failureCount: total.failureCount,
    failureRate: total.requestCount > 0 ? (total.failureCount / total.requestCount) * 100 : 0,
    inputTokens: total.inputTokens,
    outputTokens: total.outputTokens,
    totalTokens: total.totalTokens,
    consumedCredits: total.consumedCredits,
    estimatedCost: Number(total.estimatedCost.toFixed(4)),
    avgLatencyMs: total.latencyWeight > 0 ? Math.round(total.latencyWeighted / total.latencyWeight) : 0
  };
}

function topMetric(
  rows: Array<{
    providerId: string | null;
    providerInstanceId: string | null;
    providerName: string | null;
    modelId: string | null;
    modelInstanceId: string | null;
    modelName: string | null;
    toolId: string | null;
    toolName: string | null;
    requestCount: number;
    estimatedCost: { toString(): string } | string | number;
  }>,
  dimension: "model" | "tool",
  metric: "requestCount" | "estimatedCost"
) {
  const groups = new Map<string, { id: string; name: string; value: number }>();

  for (const row of rows) {
    const id =
      dimension === "model"
        ? row.modelInstanceId ?? row.modelId ?? row.modelName ?? "unknown-model"
        : row.toolId ?? row.toolName ?? "unknown-tool";
    const name =
      dimension === "model"
        ? row.modelName ?? "未知模型"
        : row.toolName ?? "未知工具";
    const current = groups.get(id) ?? {
      id,
      name,
      value: 0
    };
    current.value += metric === "requestCount" ? row.requestCount : decimalNumber(row.estimatedCost);
    groups.set(id, current);
  }

  return Array.from(groups.values()).sort((first, second) => second.value - first.value)[0] ?? null;
}

function uniqueOptions(
  rows: Array<{
    providerId: string | null;
    providerInstanceId: string | null;
    providerName: string | null;
    modelId: string | null;
    modelInstanceId: string | null;
    modelName: string | null;
  }>,
  dimension: "provider" | "model"
) {
  const options = new Map<string, string>();

  for (const row of rows) {
    const id =
      dimension === "provider"
        ? row.providerInstanceId ?? row.providerId
        : row.modelInstanceId ?? row.modelId;
    const name = dimension === "provider" ? row.providerName : row.modelName;

    if (id && name) {
      options.set(id, name);
    }
  }

  return Array.from(options.entries()).map(([id, name]) => ({
    id,
    name
  }));
}

function groupStatRows(
  rows: Array<{
    providerId: string | null;
    providerInstanceId: string | null;
    providerName: string | null;
    modelId: string | null;
    modelInstanceId: string | null;
    modelName: string | null;
    userId: string | null;
    userEmail: string | null;
  } & Parameters<typeof summarizeRows>[0][number]>,
  dimension: "provider" | "model" | "user"
) {
  const groups = new Map<string, { id: string; name: string; rows: typeof rows }>();

  for (const row of rows) {
    const id =
      dimension === "provider"
        ? row.providerInstanceId ?? row.providerId ?? row.providerName
        : dimension === "model"
          ? row.modelInstanceId ?? row.modelId ?? row.modelName
          : row.userId ?? row.userEmail;
    const name =
      dimension === "provider"
        ? row.providerName ?? "未知 Provider"
        : dimension === "model"
          ? row.modelName ?? "未知模型"
          : row.userEmail ?? "未知用户";

    if (!id) {
      continue;
    }

    const current = groups.get(id) ?? {
      id,
      name,
      rows: []
    };
    current.rows.push(row);
    groups.set(id, current);
  }

  return Array.from(groups.values());
}

function groupUsageRows(
  rows: Array<{
    providerId: string | null;
    providerInstanceId: string | null;
    providerName: string | null;
    modelId: string | null;
    modelInstanceId: string | null;
    modelName: string | null;
    toolId: string | null;
    toolName: string | null;
  } & Parameters<typeof summarizeRows>[0][number]>,
  dimension: "provider" | "model" | "tool"
) {
  const groups = new Map<string, { id: string; name: string; rows: typeof rows }>();

  for (const row of rows) {
    const id =
      dimension === "provider"
        ? row.providerInstanceId ?? row.providerId ?? row.providerName
        : dimension === "model"
          ? row.modelInstanceId ?? row.modelId ?? row.modelName
          : row.toolId ?? row.toolName;
    const name =
      dimension === "provider"
        ? row.providerName ?? "未知 Provider"
        : dimension === "model"
          ? row.modelName ?? "未知模型"
          : row.toolName ?? "未知工具";

    if (!id) {
      continue;
    }

    const current = groups.get(id) ?? {
      id,
      name,
      rows: []
    };
    current.rows.push(row);
    groups.set(id, current);
  }

  return Array.from(groups.values())
    .map((group) => ({
      id: group.id,
      name: group.name,
      ...summarizeRows(group.rows)
    }))
    .sort((first, second) => second.requestCount - first.requestCount);
}

function dateKeyInShanghai(date: Date) {
  const shifted = new Date(date.getTime() + shanghaiOffsetMs);

  return shifted.toISOString().slice(0, 10);
}

function normalizeDateKey(value: string | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return normalized;
  }

  const parsed = new Date(normalized);

  return Number.isNaN(parsed.getTime()) ? null : dateKeyInShanghai(parsed);
}

function dateKeyFromDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dateOnly(key: string) {
  return new Date(`${key}T00:00:00.000Z`);
}

function shanghaiStart(key: string) {
  const [year, month, day] = key.split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, day) - shanghaiOffsetMs);
}

function addDays(key: string, days: number) {
  const [year, month, day] = key.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));

  return next.toISOString().slice(0, 10);
}

function positiveInt(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

function decimalNumber(value: { toString(): string } | string | number | null | undefined) {
  if (value === null || value === undefined) {
    return 0;
  }

  const parsed = Number(typeof value === "number" ? value : value.toString());

  return Number.isFinite(parsed) ? parsed : 0;
}

function alertTypeName(type: string) {
  const names: Record<string, string> = {
    PROVIDER_UNAVAILABLE: "Provider 不可用",
    FAILURE_RATE_HIGH: "失败率过高",
    LATENCY_HIGH: "延迟过高",
    COST_HIGH: "成本过高",
    USER_ABNORMAL_CONSUMPTION: "用户异常消耗",
    PAYMENT_CREDIT_ANOMALY: "支付点数异常"
  };

  return names[type] ?? type;
}

function alertLevelName(level: string) {
  const names: Record<string, string> = {
    INFO: "提示",
    WARNING: "警告",
    ERROR: "严重"
  };

  return names[level] ?? level;
}
