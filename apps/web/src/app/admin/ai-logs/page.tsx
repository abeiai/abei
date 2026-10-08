import Link from "next/link";
import { AdminShell } from "@/components/shell/admin-shell";
import { AdminTaskList } from "@/components/admin/admin-task-list";
import { AiLogSourceLinks } from "@/components/admin/ai-log-source-links";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCurrentAdmin } from "@/lib/auth-actions";
import { getLegacyAiLogs, type LegacyAiLogPage } from "@/lib/legacy-ai-logs-api";
import { legacyLogListHref, normalizeLegacyLogSearch, type LegacyLogSearch } from "@/lib/legacy-ai-log-query";

export const dynamic = "force-dynamic";
const kinds = { CHAT: "对话", IMAGE: "图片", AUDIO: "语音", VIDEO: "视频" };
const statuses = { WAITING: "等待中", RUNNING: "处理中", SUCCEEDED: "成功", FAILED: "失败", UNKNOWN: "未知" };
const date = (value: string) => new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });

export default async function AdminAiLogsPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  await getCurrentAdmin();
  const params = searchParams ? await searchParams : {};
  let query: LegacyLogSearch;
  try { query = normalizeLegacyLogSearch(params); }
  catch (error) {
    return <AdminShell active="/admin/ai-logs" title="日志查询"><p role="alert" className="text-sm text-destructive">{error instanceof Error ? error.message : "查询参数不正确"}</p><Button asChild className="mt-4" variant="outline"><Link href="/admin/ai-logs">重置查询</Link></Button></AdminShell>;
  }
  if (query.source === "NEW") return <AdminTaskList searchParams={Promise.resolve(params)} basePath="/admin/ai-logs" controls={<AiLogSourceLinks source="NEW" />} />;
  let page: LegacyAiLogPage = { items: [], total: 0, page: query.page, pageSize: 50 };
  let errorMessage: string | null = null;
  try { page = await getLegacyAiLogs(query); }
  catch (error) { errorMessage = error instanceof Error ? error.message : "日志查询暂不可用，请稍后重试"; }
  const textFields = [ ["user", "用户", "用户邮箱、昵称或旧用户 ID"], ["model", "模型 / 版本", "模型或版本名称"], ["application", "应用", "旧应用名称"], ["sourceId", "旧记录 ID", "原始记录 ID"], ["startDate", "开始日期", ""], ["endDate", "结束日期", ""] ] as const;
  return <AdminShell active="/admin/ai-logs" title="日志查询">
    <div className="flex flex-col gap-6">
      <AiLogSourceLinks source="LEGACY" />
      <Card><CardHeader><CardTitle>筛选日志</CardTitle></CardHeader><CardContent>
        <form method="get" action="/admin/ai-logs" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <input type="hidden" name="source" value="LEGACY" />
          <Field><FieldLabel htmlFor="kind">日志类型</FieldLabel><Select id="kind" name="kind" defaultValue={query.kind}><option value="">全部类型</option>{Object.entries(kinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
          <Field><FieldLabel htmlFor="status">状态</FieldLabel><Select id="status" name="status" defaultValue={query.status}><option value="">全部状态</option>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
          {textFields.map(([key, label, placeholder]) => <Field key={key}><FieldLabel htmlFor={key}>{label}</FieldLabel><Input id={key} name={key} type={key.endsWith("Date") ? "date" : "text"} placeholder={placeholder} defaultValue={query[key]} maxLength={200} /></Field>)}
          <div className="flex items-end gap-2"><Button type="submit">查询日志</Button><Button asChild variant="outline"><Link href="/admin/ai-logs?source=LEGACY">重置</Link></Button></div>
        </form>
      </CardContent></Card>
      {errorMessage ? <p role="alert" className="text-sm text-destructive">{errorMessage}</p> : null}
      <Card><CardHeader className="flex flex-wrap items-center justify-between gap-4"><CardTitle>日志列表 <span className="text-sm font-normal text-muted-foreground">共 {page.total.toLocaleString("zh-CN")} 条</span></CardTitle>
        <div className="flex items-center gap-2">
          {page.page > 1 ? <Button asChild size="sm" variant="outline"><Link href={legacyLogListHref(query, page.page - 1)}>上一页</Link></Button> : <Button disabled size="sm" variant="outline">上一页</Button>}
          <span className="text-sm">第 {page.page} 页</span>
          {page.page * page.pageSize < page.total ? <Button asChild size="sm" variant="outline"><Link href={legacyLogListHref(query, page.page + 1)}>下一页</Link></Button> : <Button disabled size="sm" variant="outline">下一页</Button>}
        </div>
      </CardHeader><CardContent><div className="overflow-x-auto rounded-xl border"><Table>
        <TableHeader><TableRow>{["请求时间", "类型", "用户", "应用 / 模型", "摘要", "状态", "旧记录 ID"].map(title => <TableHead key={title}>{title}</TableHead>)}</TableRow></TableHeader>
        <TableBody>{page.items.length ? page.items.map(log => <TableRow key={log.id}>
          <TableCell className="whitespace-nowrap">{date(log.requestedAt)}</TableCell>
          <TableCell><Link className="font-medium hover:underline" href={`/admin/ai-logs/legacy/${encodeURIComponent(log.id)}`}>{kinds[log.kind]}</Link></TableCell>
          <TableCell><p>{log.user?.nickname || "归属待核验"}</p><p className="text-xs text-muted-foreground">{log.user?.email || (log.sourceUserId ? `旧用户 ${log.sourceUserId}` : "未关联用户")}</p></TableCell>
          <TableCell><p>{log.application || "未记录"}</p><p className="text-xs text-muted-foreground">{log.modelName || "未知模型"}{log.versionName ? ` / ${log.versionName}` : ""}</p></TableCell>
          <TableCell className="max-w-80"><Link className="line-clamp-2 hover:underline" href={`/admin/ai-logs/legacy/${encodeURIComponent(log.id)}`}>{log.inputPreview || log.outputPreview || "查看详情"}</Link></TableCell>
          <TableCell><Badge variant={log.status === "FAILED" ? "muted" : "outline"}>{statuses[log.status]}</Badge></TableCell>
          <TableCell className="font-mono text-xs">{log.sourcePk}</TableCell>
        </TableRow>) : <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">{errorMessage ? "日志加载失败，请调整查询或稍后重试。" : "暂无符合条件的旧版日志。"}</TableCell></TableRow>}</TableBody>
      </Table></div></CardContent></Card>
    </div>
  </AdminShell>;
}
