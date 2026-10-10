import { HttpStatus } from "@nestjs/common";
import type { Prisma } from "@xueleai/database";
import { AppException } from "../common/app-exception.js";

export function adminUserFilters(query: Record<string, unknown>) {
  const invalid = (message: string) => new AppException(40001, message, HttpStatus.BAD_REQUEST);
  const text = (name: string) => {
    const value = query[name];
    if (value === undefined || value === "") return "";
    if (typeof value !== "string" || value.length > 100) throw invalid("用户查询参数不正确");
    return value.trim();
  };
  const q = text("q"), status = text("status");
  if (status && status !== "ACTIVE" && status !== "DISABLED") throw invalid("用户状态不正确");
  const pageText = text("page") || "1", page = Number(pageText);
  if (!/^\d+$/.test(pageText) || !Number.isSafeInteger(page) || page < 1) throw invalid("用户页码必须为正整数");
  const pageSizeText = text("pageSize") || "20", pageSize = Number(pageSizeText);
  if (!/^(20|50|100)$/.test(pageSizeText)) throw invalid("每页条数只能为 20、50 或 100");
  const date = (name: string) => {
    const value = text(name);
    if (!value) return undefined;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) throw invalid("注册日期格式不正确");
    const result = new Date(`${value}T00:00:00+08:00`);
    if (!Number.isFinite(result.getTime()) || new Date(result.getTime() + 8 * 3600_000).toISOString().slice(0, 10) !== value) {
      throw invalid("注册日期不正确");
    }
    return result;
  };
  const start = date("startDate"), end = date("endDate");
  if (start && end && start > end) throw invalid("注册开始日期不能晚于结束日期");
  const where: Prisma.UserWhereInput = {};
  if (status === "ACTIVE" || status === "DISABLED") where.status = status;
  const needle = q.replace(/[\\%_]/g, "\\$&");
  if (q) where.OR = [
    { id: { contains: needle, mode: "insensitive" } },
    { email: { contains: needle, mode: "insensitive" } },
    { nickname: { contains: needle, mode: "insensitive" } }
  ];
  if (start || end) where.createdAt = { gte: start, lt: end ? new Date(end.getTime() + 86400_000) : undefined };
  return { where, page, pageSize };
}
