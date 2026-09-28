import { ShieldCheck } from "lucide-react";

import { AdminShell } from "@/components/shell/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAdminOperationLogs, getOperationLogAdmins } from "@/lib/operation-logs-api";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams?: Promise<{
    adminUserId?: string;
    resourceType?: string;
    startedAt?: string;
    endedAt?: string;
  }>;
}

const resourceTypes = [
  "USER",
  "SYSTEM_CONFIG",
  "PAYMENT_ORDER",
  "ARTICLE",
  "ARTICLE_CATEGORY",
  "PAGE",
  "AI_PROVIDER",
  "ADMIN_USER"
];

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    hour12: false
  });
}

export default async function AdminOperationLogsPage({ searchParams }: PageProps) {
  const filters = (await searchParams) ?? {};
  const [logs, admins] = await Promise.all([
    getAdminOperationLogs(filters),
    getOperationLogAdmins()
  ]);

  return (
    <AdminShell
      active="/admin/operation-logs"
      title="操作日志"
      description="按管理员、资源类型和时间范围查看后台关键操作。"
    >
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>筛选条件</CardTitle>
            <CardDescription>日志默认展示最近 200 条，筛选项会通过查询参数保留。</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-4 md:grid md:grid-cols-5" method="get">
              <FieldGroup className="contents">
                <Field>
                  <FieldLabel htmlFor="adminUserId">管理员</FieldLabel>
                  <Select id="adminUserId" name="adminUserId" defaultValue={filters.adminUserId ?? ""}>
                    <option value="">全部管理员</option>
                    {admins.map((admin) => (
                      <option key={admin.id} value={admin.id}>
                        {admin.name} / {admin.email}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="resourceType">资源类型</FieldLabel>
                  <Select id="resourceType" name="resourceType" defaultValue={filters.resourceType ?? ""}>
                    <option value="">全部资源</option>
                    {resourceTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="startedAt">开始日期</FieldLabel>
                  <Input id="startedAt" name="startedAt" type="date" defaultValue={filters.startedAt ?? ""} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="endedAt">结束日期</FieldLabel>
                  <Input id="endedAt" name="endedAt" type="date" defaultValue={filters.endedAt ?? ""} />
                </Field>
                <Field className="justify-end">
                  <Button type="submit">
                    <ShieldCheck data-icon="inline-start" />
                    查询日志
                  </Button>
                </Field>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>日志列表</CardTitle>
            <CardDescription>记录管理员、操作类型、资源、IP 和 User-Agent。</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-xl border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>时间</TableHead>
                    <TableHead>管理员</TableHead>
                    <TableHead>操作类型</TableHead>
                    <TableHead>资源类型</TableHead>
                    <TableHead>资源 ID</TableHead>
                    <TableHead>描述</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>User-Agent</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.length > 0 ? (
                    logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>{formatDate(log.createdAt)}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <span>{log.adminUser?.name ?? "未知管理员"}</span>
                            <span className="text-xs text-muted-foreground">{log.adminUser?.email}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{log.actionName}</Badge>
                        </TableCell>
                        <TableCell>{log.resourceType}</TableCell>
                        <TableCell className="max-w-44 truncate font-mono text-xs">{log.resourceId ?? "无"}</TableCell>
                        <TableCell className="max-w-sm text-sm">{log.description}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{log.ip ?? "未知"}</TableCell>
                        <TableCell className="max-w-sm truncate text-sm text-muted-foreground">
                          {log.userAgent ?? "未知"}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell className="text-muted-foreground" colSpan={8}>
                        暂无操作日志。
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}
