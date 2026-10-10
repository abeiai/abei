export type AdminUserFilters = Partial<Record<"q" | "status" | "startDate" | "endDate" | "page" | "pageSize", string>>;
const filterKeys = ["q", "status", "startDate", "endDate", "page", "pageSize"] as const;

export function readAdminUserFilters(params: Record<string, string | string[] | undefined>): AdminUserFilters {
  return Object.fromEntries(filterKeys.map(key => {
    const value = params[key];
    return [key, (Array.isArray(value) ? value[0] : value)?.trim() ?? ""];
  }));
}

export function adminUserQuery(filters: AdminUserFilters, page?: number) {
  const query = new URLSearchParams();
  for (const key of filterKeys) {
    if (filters[key]) query.set(key, filters[key]!);
  }
  if (page !== undefined) query.set("page", String(page));
  return query.toString();
}

export function adminUserPageHref(filters: AdminUserFilters, page: number) {
  return `/admin/users?${adminUserQuery(filters, page)}`;
}
