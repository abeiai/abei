import type { Metadata } from "next";

import { AdminShell } from "@/components/shell/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getEnvCheckItems, type EnvCheckItem } from "@/lib/onboarding-api";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "环境变量检查 - 学乐 AI",
  description: "检查数据库、Redis、JWT、支付、AI Provider、对象存储和邮件服务配置状态。"
};

function statusVariant(status: EnvCheckItem["status"]) {
  if (status === "已配置" || status === "连接正常") {
    return "secondary" as const;
  }

  if (status === "连接失败") {
    return "muted" as const;
  }

  return "outline" as const;
}

export default async function AdminEnvCheckPage() {
  const items = await getEnvCheckItems();

  return (
    <AdminShell
      active="/admin/system/env-check"
      title="环境变量检查"
      description="只展示配置状态和脱敏说明，不显示密钥原文。"
    >
      <Card>
        <CardHeader>
          <CardTitle>运行环境状态</CardTitle>
          <CardDescription>数据库连接串、JWT Secret、支付私钥和 API Key 均不会在此页明文展示。</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>检查项</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>说明</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.key}>
                    <TableCell className="font-medium">{item.label}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(item.status)}>{item.status}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{item.detail}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </AdminShell>
  );
}
