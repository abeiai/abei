export interface LegacyLogSearch {
  source: "NEW" | "LEGACY";
  kind: string;
  status: string;
  user: string;
  model: string;
  application: string;
  sourceId: string;
  startDate: string;
  endDate: string;
  page: number;
}

export function normalizeLegacyLogSearch(params: Record<string, string | string[] | undefined>): LegacyLogSearch {
  const text = (key: string) => {
    const value = params[key];
    if (Array.isArray(value)) throw new Error("查询参数不能重复");
    if (value && value.length > 200) throw new Error("查询参数过长");
    return value?.trim() ?? "";
  };
  const source = text("source") || "NEW";
  if (source !== "NEW" && source !== "LEGACY") throw new Error("日志来源不正确");
  const pageText = text("page") || "1";
  const page = Number(pageText);
  if (!/^\d+$/.test(pageText) || page < 1 || page > 10_000) throw new Error("页码不正确");
  return {
    source, page,
    kind: text("kind"), status: text("status"), user: text("user"),
    model: text("model"), application: text("application"), sourceId: text("sourceId"),
    startDate: text("startDate"), endDate: text("endDate"),
  };
}

export function legacyLogListHref(query: LegacyLogSearch, page = query.page) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...query, page })) {
    if (value !== "") params.set(key, String(value));
  }
  return `/admin/ai-logs?${params}`;
}
