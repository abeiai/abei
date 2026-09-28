import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, CheckCircle2 } from "lucide-react";

import { PublicShell } from "@/components/shell/public-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { featureGroups } from "@/lib/product-data";

export const metadata: Metadata = {
  title: "产品功能 - 学乐 AI",
  description: "了解学乐 AI 如何把文案、音视频和图片素材转为导学课件、讲解音频和练习材料。"
};

export default function FeaturesPage() {
  return (
    <PublicShell>
      <section className="flex w-full flex-col gap-10 px-5 py-16">
        <div className="flex w-full flex-col gap-5">
          <Badge>产品功能</Badge>
          <h1 className="max-w-4xl font-display text-5xl font-semibold leading-tight tracking-normal md:text-6xl">
            把零散素材变成成体系的学习材料
          </h1>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/register">
                免费注册
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/tools">打开场景应用</Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {featureGroups.map((group) => (
            <Card className="xueleai-interactive-card" key={group.title}>
              <CardHeader>
                <div className="xueleai-icon-tile flex size-10 items-center justify-center rounded-md">
                  <group.icon />
                </div>
                <CardTitle>{group.title}</CardTitle>
                <CardDescription>{group.description}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                {group.items.map((item) => (
                  <div className="flex items-center gap-3 text-sm" key={item}>
                    <CheckCircle2 data-icon="inline-start" />
                    <span>{item}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </PublicShell>
  );
}
