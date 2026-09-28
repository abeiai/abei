import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, CheckCircle2 } from "lucide-react";

import { PublicShell } from "@/components/shell/public-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCaseGroups } from "@/lib/product-data";

export const metadata: Metadata = {
  title: "使用场景 - 学乐 AI",
  description: "查看学乐 AI 在家长辅学、学生自学、老师备课、视频导学和英文带学中的使用方式。"
};

export default function UseCasesPage() {
  return (
    <PublicShell>
      <section className="flex w-full flex-col gap-10 px-5 py-16">
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
          <div className="flex flex-col gap-5">
            <Badge>使用场景</Badge>
            <h1 className="font-display text-5xl font-semibold leading-tight tracking-normal md:text-6xl">
              围绕真实学习场景，而不是抽象 AI 能力
            </h1>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/tools">
                  打开场景应用
                  <ArrowRight data-icon="inline-end" />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/textbook">浏览教材</Link>
              </Button>
            </div>
          </div>
          <Card className="xueleai-interactive-card">
            <CardHeader>
              <CardTitle>启动路径</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              {["注册账号", "放入学习素材", "生成导学材料", "在任务历史回看结果"].map((step) => (
                <div className="flex items-center gap-3" key={step}>
                  <CheckCircle2 data-icon="inline-start" />
                  <span>{step}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {useCaseGroups.map((group) => (
            <Card className="xueleai-interactive-card" key={group.title}>
              <CardHeader>
                <div className="xueleai-icon-tile flex size-10 items-center justify-center rounded-md">
                  <group.icon />
                </div>
                <CardTitle>{group.title}</CardTitle>
                <CardDescription>{group.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {group.examples.map((example) => (
                  <Badge variant="outline" key={example}>
                    {example}
                  </Badge>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

    </PublicShell>
  );
}
