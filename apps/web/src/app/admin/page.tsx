import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  BrainCircuit,
  ChevronRight,
  FileText,
  FolderTree,
  Newspaper,
  Plus,
  ReceiptText,
  ScrollText,
  Settings,
  Users
} from "lucide-react";

import { AdminShell } from "@/components/shell/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAdminAiProviderPresets, getAdminAiTasks } from "@/lib/ai-admin-api";
import { getSystemAlerts } from "@/lib/ai-usage-api";
import { getAdminUsers } from "@/lib/admin-users-api";
import { getAdminArticles, getAdminCategories, getAdminPages } from "@/lib/cms-api";
import { getAdminOperationLogs } from "@/lib/operation-logs-api";
import { getAdminPaymentOrders } from "@/lib/payment-admin-api";
import { getAdminSystemConfigs } from "@/lib/settings-api";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  const [
    articles,
    categories,
    pages,
    systemConfigs,
    paymentOrders,
    aiTasks,
    aiProviders,
    users,
    operationLogs,
    systemAlerts
  ] = await Promise.all([
    getAdminArticles(),
    getAdminCategories(),
    getAdminPages(),
    getAdminSystemConfigs(),
    getAdminPaymentOrders(),
    getAdminAiTasks(),
    getAdminAiProviderPresets(),
    getAdminUsers(),
    getAdminOperationLogs(),
    getSystemAlerts("OPEN")
  ]);
  const stats = [
    { label: "近期注册用户", value: users.length, description: "最近注册账号", icon: Users, href: "/admin/users", tone: "blue" },
    {
      label: "文章",
      value: articles.length,
      description: "包含已发布和草稿",
      icon: Newspaper,
      href: "/admin/articles",
      tone: "pink"
    },
    {
      label: "支付订单",
      value: paymentOrders.length,
      description: "近期充值订单",
      icon: ReceiptText,
      href: "/admin/payments",
      tone: "amber"
    },
    {
      label: "任务清单",
      value: aiTasks.length,
      description: "近期生成任务",
      icon: BrainCircuit,
      href: "/admin/ai-tasks",
      tone: "green"
    }
  ];
  const modules = [
    { label: "模型配置", value: aiProviders.length, icon: Bot, href: "/admin/ai/providers" },
    { label: "文章分类", value: categories.length, icon: FolderTree, href: "/admin/categories" },
    { label: "单页管理", value: pages.length, icon: FileText, href: "/admin/pages" },
    { label: "操作日志", value: operationLogs.length, icon: ScrollText, href: "/admin/operation-logs" },
    { label: "系统设置", value: systemConfigs.length, icon: Settings, href: "/admin/settings" }
  ];
  const contentStatuses = [
    { label: "已发布", count: articles.filter((article) => article.status === "PUBLISHED").length, color: "#46a68e" },
    { label: "草稿", count: articles.filter((article) => article.status === "DRAFT").length, color: "#d9a741" },
    { label: "已归档", count: articles.filter((article) => article.status === "ARCHIVED").length, color: "#a4b0c0" }
  ];

  return (
    <AdminShell
      active="/admin"
      title="后台首页"
    >
      <div className="flex flex-col gap-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <Link className="abei-admin-stat" data-tone={stat.tone} href={stat.href} key={stat.label}>
              <div className="flex items-center justify-between gap-3"><span className="text-sm font-medium">{stat.label}</span><span className="abei-admin-stat-icon"><stat.icon className="size-4" /></span></div>
              <span className="text-3xl font-semibold tabular-nums">{stat.value.toLocaleString("zh-CN")}</span>
              <div className="flex items-center justify-between text-xs text-muted-foreground"><span>{stat.description}</span><ArrowRight className="size-3.5" /></div>
              <div aria-hidden="true" className="abei-admin-stat-rule" />
            </Link>
          ))}
        </div>

        {systemAlerts.length > 0 ? (
          <Card className="abei-admin-alert">
            <CardHeader className="gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col gap-2">
                <CardTitle>系统告警</CardTitle>
                <CardDescription>当前存在未处理告警，建议优先检查 AI Provider、失败率和点数异常。</CardDescription>
              </div>
              <Button asChild variant="outline">
                <Link href="/admin/ai/usage">
                  查看告警
                  <ArrowRight data-icon="inline-end" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2">
                {systemAlerts.slice(0, 4).map((alert) => (
                  <div className="rounded-md border border-border p-4" key={alert.id}>
                    <div className="flex items-center gap-2">
                      <AlertTriangle />
                      <Badge variant={alert.level === "ERROR" ? "muted" : "outline"}>{alert.levelName}</Badge>
                      <span className="font-medium">{alert.title}</span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{alert.message}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between"><CardTitle>内容概览</CardTitle><Button asChild size="sm" variant="outline"><Link href="/admin/articles/new"><Plus />新建文章</Link></Button></CardHeader>
            <CardContent className="flex flex-col gap-6">
              <div className="flex items-end gap-2"><span className="text-3xl font-semibold tabular-nums">{articles.length}</span><span className="pb-1 text-sm text-muted-foreground">篇文章</span></div>
              <div aria-hidden="true" className="flex h-2 overflow-hidden rounded-full bg-muted">{contentStatuses.map((status) => <div key={status.label} style={{ width: `${articles.length ? status.count / articles.length * 100 : 0}%`, backgroundColor: status.color }} />)}</div>
              <div className="grid grid-cols-3 gap-4">{contentStatuses.map((status) => <div key={status.label}><div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="size-2 rounded-full" style={{ backgroundColor: status.color }} />{status.label}</div><p className="mt-2 text-xl font-semibold tabular-nums">{status.count}</p></div>)}</div>
              <div className="flex justify-between border-t border-border pt-4 text-sm"><span className="text-muted-foreground">文章分类 {categories.length} · 单页 {pages.length}</span><Link className="font-medium text-primary" href="/admin/articles">管理内容 <ArrowRight className="ml-1 inline size-3.5" /></Link></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>常用管理</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">{modules.map((item) => <Link className="abei-admin-module-link" href={item.href} key={item.href}><span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary text-primary"><item.icon className="size-4" /></span><div className="min-w-0 flex-1"><p className="text-sm font-medium">{item.label}</p><p className="mt-1 text-xs text-muted-foreground">{item.value} 项</p></div><ChevronRight className="size-3.5 text-muted-foreground" /></Link>)}</CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-2">
              <CardTitle>最近文章</CardTitle>
            </div>
            <Button asChild variant="outline">
              <Link href="/admin/articles">
                管理文章
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-xl border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>标题</TableHead>
                    <TableHead>分类</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>更新时间</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...articles].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 6).map((article) => (
                    <TableRow key={article.slug}>
                      <TableCell className="font-medium"><Link className="hover:text-primary" href={`/admin/articles/${article.id}/edit`}>{article.title}</Link></TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(article.categories && article.categories.length > 0 ? article.categories : article.category ? [article.category] : []).map(
                            (category) => (
                              <Badge variant="outline" key={category.id}>
                                {category.name}
                              </Badge>
                            )
                          )}
                          {!article.categories?.length && !article.category ? (
                            <span className="text-sm text-muted-foreground">未分类</span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={article.status === "PUBLISHED" ? "secondary" : "muted"}>
                          {article.status === "PUBLISHED"
                            ? "已发布"
                            : article.status === "ARCHIVED"
                              ? "已归档"
                              : "草稿"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(article.updatedAt).toLocaleDateString("zh-CN")}
                      </TableCell>
                    </TableRow>
                  ))}
                  {articles.length === 0 ? <TableRow><TableCell className="py-10 text-center text-muted-foreground" colSpan={4}>暂无文章<Button asChild className="ml-3" size="sm" variant="outline"><Link href="/admin/articles/new">新建文章</Link></Button></TableCell></TableRow> : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}
