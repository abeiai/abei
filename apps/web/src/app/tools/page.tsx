import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ArrowRight, BookOpenText, Brain, Captions, FileText, Film, Layers3, ListChecks, Share2, Sparkles, Volume2, type LucideIcon } from "lucide-react";

import { learnerHomeModel } from "@/components/profiles/learner-home";
import { PublicShell } from "@/components/shell/public-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getWebProfile } from "@/lib/profile-api";
import { profileSelectionHref } from "@/lib/profile-routing";

export const metadata: Metadata = {
  title: "场景应用 - 学乐 AI",
  description: "查看学乐 AI 已开放的视频导学、英文带学等学习材料生成应用。"
};

export default async function ToolsPage() {
  const profile = await getWebProfile("/tools");

  if (profile.mode === "UNSELECTED") {
    redirect(profileSelectionHref("/tools"));
  }

  const publicApplications: Array<{
    cta: string;
    description: string;
    highlights: Array<{ icon: LucideIcon; label: string }>;
    href: string;
    icon: LucideIcon;
    title: string;
  }> = [
    {
      title: "绘本创作",
      description: "聊聊故事构想，安排角色和分镜，逐页制作插画与讲解语音。",
      href: "/picture-books",
      cta: "开始创作绘本",
      icon: BookOpenText,
      highlights: [
        { icon: Sparkles, label: "故事分镜" },
        { icon: BookOpenText, label: "逐页编辑" },
        { icon: Volume2, label: "语音讲解" }
      ]
    },
    {
      title: "英语音标",
      description: "学习 48 个英语音标，听发音、看口型，按字母数练习常见词汇。",
      href: "/yinbiao",
      cta: "开始学习音标",
      icon: Volume2,
      highlights: [
        { icon: Volume2, label: "音标发音" },
        { icon: BookOpenText, label: "发音要领" },
        { icon: ListChecks, label: "词汇练习" }
      ]
    },
    {
      title: "视频导学",
      description: "上传视频或音频与 SRT / ASS 字幕，生成分阶段 AI 导学课件。",
      href: "/media-tutor",
      cta: "开始生成导学课件",
      icon: Film,
      highlights: [
        { icon: Captions, label: "互动讲解" },
        { icon: Share2, label: "分享学习页" },
        { icon: Film, label: "跟读训练" }
      ]
    },
    {
      title: "英文带学",
      description: "上传图片或粘贴英文文本，按英语水平生成逐句讲解、讲解音频和 10 道练习题。",
      href: "/text2lesson",
      cta: "开始英文带学",
      icon: BookOpenText,
      highlights: [
        { icon: Captions, label: "图片识别" },
        { icon: Volume2, label: "同步音频" },
        { icon: ListChecks, label: "练习巩固" }
      ]
    },
    {
      title: "学古诗文",
      description: "上传古诗词或古文，按学段年级生成背景讲解、逐句理解、诵读和背诵引导。",
      href: "/gushiwen",
      cta: "开始学古诗文",
      icon: BookOpenText,
      highlights: [
        { icon: Captions, label: "图片识别" },
        { icon: Volume2, label: "诵读带学" },
        { icon: ListChecks, label: "背诵巩固" }
      ]
    },
    {
      title: "开卷导读",
      description: "提交中文阅读内容或文档，按学段年级与学习时间生成完整导读、讲解音频和同步练习。",
      href: "/daodu",
      cta: "开始开卷导读",
      icon: BookOpenText,
      highlights: [
        { icon: FileText, label: "文档导入" },
        { icon: Volume2, label: "整篇音频" },
        { icon: ListChecks, label: "题量可选" }
      ]
    },
    {
      title: "AI 学习闪卡",
      description: "从电子教材、上传材料或已有卡组生成知识地图和复习闪卡。",
      href: "/flashcard",
      cta: "创建学习闪卡",
      icon: Layers3,
      highlights: [
        { icon: BookOpenText, label: "教材筛选" },
        { icon: Brain, label: "知识地图" },
        { icon: ListChecks, label: "沉浸复习" }
      ]
    }
  ];
  const sceneApplications = profile.mode === "LEARNER"
    ? learnerHomeModel(profile.home).scenarioCards.map((scenario) => ({
        title: scenario.name,
        description: scenario.description ?? "",
        href: scenario.href,
        cta: "进入应用",
        icon: Sparkles,
        highlights: []
      }))
    : publicApplications;

  return (
    <PublicShell>
      <section className="flex w-full flex-col gap-10 px-5 py-16">
        <div className="flex max-w-3xl flex-col gap-5">
          <Badge>场景应用</Badge>
          <h1 className="font-display text-5xl font-semibold leading-tight tracking-normal md:text-6xl">
            从一份素材开始，生成一套学习材料
          </h1>
        </div>

        {sceneApplications.length ? (
          <div className="grid max-w-6xl gap-5 lg:grid-cols-2">
            {sceneApplications.map((application) => (
            <Card className="xueleai-interactive-card" key={application.href}>
              <CardHeader>
                <div className="xueleai-icon-tile flex size-12 items-center justify-center rounded-md">
                  <application.icon />
                </div>
                <CardTitle>{application.title}</CardTitle>
                <CardDescription>{application.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                {application.highlights.length ? (
                  <div className="grid gap-3 text-sm md:grid-cols-3">
                    {application.highlights.map(({ icon: Icon, label }) => (
                      <div className="flex items-center gap-3 rounded-md border border-border bg-background/70 p-3" key={label}>
                        <span className="xueleai-icon-tile flex size-9 items-center justify-center rounded-md">
                          <Icon />
                        </span>
                        <span className="font-medium">{label}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
                <Button asChild className="w-fit">
                  <Link href={application.href}>
                    {application.cta}
                    <ArrowRight data-icon="inline-end" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
            ))}
          </div>
        ) : (
          <div className="max-w-3xl rounded-2xl border border-dashed border-border px-5 py-8 text-sm text-muted-foreground">
            暂无可用应用
          </div>
        )}
      </section>
    </PublicShell>
  );
}
