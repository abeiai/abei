import { HttpStatus } from "@nestjs/common";
import type { Prisma } from "@xueleai/database";
import { AppException } from "../common/app-exception.js";

const kinds = ["CHAT", "IMAGE", "AUDIO", "VIDEO"] as const;
const statuses = ["WAITING", "RUNNING", "SUCCEEDED", "FAILED", "UNKNOWN"] as const;
export const invalidLogQuery = (message = "日志查询参数不正确") => new AppException(40001, message, HttpStatus.BAD_REQUEST);

export function legacyLogFilters(query: Record<string, unknown>) {
  const text = (name: string) => {
    const value = query[name];
    if (value === undefined || value === "") return "";
    if (typeof value !== "string" || value.length > 200) throw invalidLogQuery();
    return value.trim();
  };
  const kind = text("kind"), status = text("status");
  if (kind && !kinds.includes(kind as typeof kinds[number])) throw invalidLogQuery("日志类型不正确");
  if (status && !statuses.includes(status as typeof statuses[number])) throw invalidLogQuery("日志状态不正确");
  const pageText = text("page") || "1", page = Number(pageText);
  if (!/^\d+$/.test(pageText) || page < 1 || page > 10_000) throw invalidLogQuery("日志页码不正确");
  const date = (name: string) => {
    const value = text(name);
    if (!value) return undefined;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw invalidLogQuery("日志日期格式不正确");
    const result = new Date(value + "T00:00:00+08:00");
    if (!Number.isFinite(result.getTime()) || new Date(result.getTime() + 8 * 3600_000).toISOString().slice(0, 10) !== value) throw invalidLogQuery("日志日期不正确");
    return result;
  };
  const start = date("startDate"), end = date("endDate");
  if (start && end && start > end) throw invalidLogQuery("开始日期不能晚于结束日期");
  const where: Prisma.LegacyAiLogWhereInput = {};
  if (kind) where.kind = kind as typeof kinds[number];
  if (status) where.status = status as typeof statuses[number];
  if (start || end) where.requestedAt = { gte: start, lt: end ? new Date(end.getTime() + 86400_000) : undefined };
  const sourceId = text("sourceId"), model = text("model"), application = text("application"), user = text("user");
  if (sourceId) where.sourcePk = sourceId;
  if (model) where.modelName = { contains: model, mode: "insensitive" };
  if (application) where.application = { contains: application, mode: "insensitive" };
  if (user) where.OR = [
    { sourceUserId: user },
    { userId: user },
    { user: { is: { OR: [{ email: { contains: user, mode: "insensitive" } }, { nickname: { contains: user, mode: "insensitive" } }] } } },
  ];
  return { where, page, pageSize: 50 };
}

const secretKey = /^(?:api[_-]?key|api[_-]?secret|secret|password|passwd|authorization|cookie|set-cookie|access[_-]?token|refresh[_-]?token|credential[s]?|token|encodingaeskey|private[_-]?key|client[_-]?secret|x-api-key)$/i;

export function redactLogText(value: string | null | undefined): string | null {
  if (value == null) return null;
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+/gi, "Bearer [已隐藏]")
    .replace(/\bsk-[A-Za-z0-9_-]{16,}/g, "[已隐藏]")
    .replace(/((?:api[_-]?key|api[_-]?secret|password|passwd|access[_-]?token|refresh[_-]?token|client[_-]?secret|secret|authorization|cookie|x-api-key)["']?\s*[:=]\s*["']?)[^\s,"';&<>]+/gi, "$1[已隐藏]")
    .replace(/([?&](?:token|signature|x-amz-signature|x-amz-credential|x-amz-security-token|ossaccesskeyid|security-token)=)[^&#\s"'<>]*/gi, "$1[已隐藏]");
}

export function redactLogJson(value: unknown, depth = 0): unknown {
  if (depth > 16) return "[嵌套内容过深]";
  if (typeof value === "string") return redactLogText(value);
  if (Array.isArray(value)) return value.map(item => redactLogJson(item, depth + 1));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, secretKey.test(key) ? "[已隐藏]" : redactLogJson(child, depth + 1)]));
  return value;
}

export function sameLegacyOwner(a: { userId: string | null; sourceSystem: string; sourceUserId: string | null }, b: { userId: string | null; sourceSystem: string; sourceUserId: string | null }) {
  if (a.userId && b.userId) return a.userId === b.userId;
  return !a.userId && !b.userId && !!a.sourceUserId && a.sourceSystem === b.sourceSystem && a.sourceUserId === b.sourceUserId;
}
