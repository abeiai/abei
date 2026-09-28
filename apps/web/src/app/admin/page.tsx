import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  BrainCircuit,
  FileText,
  FolderTree,
  Newspaper,
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
import { getAdminAiProviders, getAdminAiTasks } from "@/lib/ai-admin-api";
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
    getAdminAiProviders(),
    getAdminUsers(),
    getAdminOperationLogs(),
    getSystemAlerts("OPEN")
  ]);
  const stats = [
    {
      label: "文章分类",
      value: categories.length,
      description: "已建立内容分组",
      icon: FolderTree,
      href: "/admin/categories"
    },
    {
      label: "文章",
      value: articles.length,
      description: "包含已发布和草稿",
      icon: Newspaper,
      href: "/admin/articles"
    },
    {
      label: "单页",
      value: pages.length,
      description: "用于关于、条款等页面",
      icon: FileText,
      href: "/admin/pages"
    },
    {
      label: "用户",
      value: users.length,
      description: "注册用户账号",
      icon: Users,
      href: "/admin/users"
    },
    {
      label: "支付订单",
      value: paymentOrders.length,
      description: "点数充值订单",
      icon: ReceiptText,
      href: "/admin/payments"
    },
    {
      label: "任务清单",
      value: aiTasks.length,
      description: "生成任务记录",
      icon: BrainCircuit,
      href: "/admin/ai-tasks"
    },
    {
      label: "模型配置",
      value: aiProviders.length,
      description: "预置模型接入",
      icon: Bot,
      href: "/admin/ai/providers"
    },
    {
      label: "操作日志",
      value: operationLogs.length,
      description: "后台关键操作",
      icon: ScrollText,
      href: "/admin/operation-logs"
    },
    {
      label: "系统配置",
      value: systemConfigs.length,
      description: "基础站点配置",
      icon: Settings,
      href: "/admin/settings"
    }
  ];

  return (
    <AdminShell
      active="/admin"
      title="管理后台首页"
      description="查看学习内容运营概览和后台模块入口。"
    >
      <div className="flex flex-col gap-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.label}>
              <CardHeader>
                <div className="xueleai-icon-tile flex size-10 items-center justify-center rounded-md">
                  <stat.icon />
                </div>
                <CardDescription>{stat.label}</CardDescription>
                <CardTitle className="text-3xl">{stat.value}</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">{stat.description}</p>
                <Link className="text-sm font-medium" href={stat.href}>
                  进入
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>

        {systemAlerts.length > 0 ? (
          <Card>
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

        <Card>
          <CardHeader className="gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-2">
              <CardTitle>最近文章</CardTitle>
              <CardDescription>文章数据来自真实 CMS API。</CardDescription>
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
                  {articles.map((article) => (
                    <TableRow key={article.slug}>
                      <TableCell className="font-medium">{article.title}</TableCell>
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
                        {article.publishedAt
                          ? new Date(article.publishedAt).toLocaleDateString("zh-CN")
                          : "未发布"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}
