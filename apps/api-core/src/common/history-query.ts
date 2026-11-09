import { AppException } from "./app-exception.js";

export type HistoryQuery = { q?: string; page?: string; pageSize?: string };

export function parseHistoryQuery(query: HistoryQuery) {
  if (query.q !== undefined && typeof query.q !== "string") throw new AppException(40001, "历史记录查询参数无效", 400);
  if (query.page !== undefined && typeof query.page !== "string") throw new AppException(40001, "历史记录查询参数无效", 400);
  if (query.pageSize !== undefined && typeof query.pageSize !== "string") throw new AppException(40001, "历史记录查询参数无效", 400);
  const q = (query.q ?? "").trim();
  const page = Number(query.page ?? 1);
  const pageSize = Number(query.pageSize ?? 20);
  if (q.length > 100 || !Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 50 || !Number.isSafeInteger((page - 1) * pageSize)) {
    throw new AppException(40001, "历史记录查询参数无效", 400);
  }
  return { q, page, pageSize, skip: (page - 1) * pageSize };
}
