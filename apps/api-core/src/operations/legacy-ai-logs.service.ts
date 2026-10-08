import { HttpStatus, Injectable } from "@nestjs/common";
import { getPrismaClient } from "@xueleai/database";
import { AppException } from "../common/app-exception.js";
import { legacyLogFilters, redactLogJson, redactLogText, sameLegacyOwner } from "./legacy-ai-logs.types.js";
import { legacyLogFile } from "./legacy-ai-log-files.js";

const userSelect = { id: true, email: true, nickname: true } as const;
const listSelect = {
  id: true, sourceSystem: true, sourceTable: true, sourcePk: true, sourceUserId: true,
  kind: true, status: true, sourceStatus: true, application: true,
  providerName: true, modelName: true, versionName: true,
  inputPreview: true, outputPreview: true, requestedAt: true, respondedAt: true,
  user: { select: userSelect },
} as const;

function summary<T extends { inputPreview: string | null; outputPreview: string | null }>(row: T) {
  return { ...row, inputPreview: redactLogText(row.inputPreview)?.slice(0, 160) ?? null, outputPreview: redactLogText(row.outputPreview)?.slice(0, 160) ?? null };
}

@Injectable()
export class LegacyAiLogsService {
  private readonly prisma = getPrismaClient();

  async file(logId: string, assetId: string, range?: string) {
    const asset = await this.prisma.legacyAiLogAsset.findFirst({ where: { id: assetId, logId } });
    if (!asset) throw new AppException(40401, "历史素材尚不可用", 404);
    return legacyLogFile(asset, range);
  }

  async list(query: Record<string, unknown> = {}) {
    const { where, page, pageSize } = legacyLogFilters(query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.legacyAiLog.findMany({
        where, select: listSelect,
        orderBy: [{ requestedAt: "desc" }, { id: "desc" }], take: pageSize, skip: (page - 1) * pageSize,
      }),
      this.prisma.legacyAiLog.count({ where }),
    ], { isolationLevel: "RepeatableRead" });
    return { items: items.map(summary), total, page, pageSize };
  }

  async detail(id: string, sessionPageValue?: unknown) {
    const { page: sessionPage } = legacyLogFilters({ page: sessionPageValue });
    const log = await this.prisma.legacyAiLog.findUnique({ where: { id }, include: {
      user: { select: userSelect },
      assets: { orderBy: [{ position: "asc" }, { id: "asc" }] },
      sessionItems: {
        include: {
          session: {
            include: {
              _count: { select: { items: true } },
              items: {
                orderBy: { position: "asc" },
                take: 50, skip: (sessionPage - 1) * 50,
                include: {
                  log: { select: { id: true, userId: true, sourceSystem: true, sourceUserId: true, inputText: true, outputText: true, requestedAt: true, kind: true } },
                },
              },
            },
          },
        },
      },
    } });
    if (!log) throw new AppException(40401, "历史日志不存在", HttpStatus.NOT_FOUND);
    const sessions = [...new Map(log.sessionItems.map(link => [link.session.id, link.session])).values()]
      .filter(session => sameLegacyOwner(log, session))
      .map(session => ({
        id: session.id, title: redactLogText(session.title), systemPrompt: redactLogText(session.systemPrompt),
        page: sessionPage, pageSize: 50, total: session._count.items,
        items: session.items.map(item => ({ position: item.position, sourceMsgId: item.sourceMsgId,
          log: item.log && sameLegacyOwner(session, item.log) ? {
            id: item.log.id, kind: item.log.kind, requestedAt: item.log.requestedAt,
            inputText: redactLogText(item.log.inputText)?.slice(0, 2000) ?? null, outputText: redactLogText(item.log.outputText)?.slice(0, 2000) ?? null,
          } : null,
        })),
      }));
    return {
      ...summary({ id: log.id, kind: log.kind, status: log.status, sourceSystem: log.sourceSystem, sourceTable: log.sourceTable, sourcePk: log.sourcePk,
        sourceUserId: log.sourceUserId, sourceStatus: log.sourceStatus, application: log.application, providerName: log.providerName,
        modelName: log.modelName, versionName: log.versionName, inputPreview: log.inputPreview, outputPreview: log.outputPreview,
        requestedAt: log.requestedAt, respondedAt: log.respondedAt, user: log.user }),
      sourceMsgId: log.sourceMsgId, sourceTaskId: redactLogText(log.sourceTaskId), voiceName: log.voiceName,
      inputText: redactLogText(log.inputText), outputText: redactLogText(log.outputText), systemPrompt: redactLogText(log.systemPrompt),
      parameters: redactLogJson(log.parameters), errorMessage: redactLogText(log.errorMessage),
      inputTokens: log.inputTokens, outputTokens: log.outputTokens, totalTokens: log.totalTokens,
      textLength: log.textLength, durationRaw: log.durationRaw, durationUnit: log.durationUnit, usageVerified: log.usageVerified,
      sessions,
      assets: log.assets.map(asset => ({ id: asset.id, position: asset.position, role: asset.role, fieldPath: asset.fieldPath,
        mediaType: asset.mediaType, status: asset.status, filename: redactLogText(asset.filename),
        url: asset.status === "AVAILABLE" && asset.storageKey ? `/api/admin/legacy-ai-logs/${encodeURIComponent(id)}/assets/${encodeURIComponent(asset.id)}/file` : null,
      })),
    };
  }
}
