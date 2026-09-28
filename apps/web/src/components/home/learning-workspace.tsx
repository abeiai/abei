import Link from "next/link";
import {
  ArrowRight,
  BookOpenText,
  Check,
  FileAudio,
  FileImage,
  PenLine,
  Sparkles,
  Wand2,
  type LucideIcon
} from "lucide-react";

import { Button } from "@/components/ui/button";

const roles = [
  {
    key: "parent",
    label: "家长",
    action: "辅学",
    href: "/tools",
    output: ["讲解稿", "亲子提问", "练习卡"]
  },
  {
    key: "student",
    label: "学生",
    action: "自学",
    href: "/text2lesson",
    output: ["逐句讲解", "跟读音频", "错题回看"]
  },
  {
    key: "teacher",
    label: "老师",
    action: "备课",
    href: "/media-tutor",
    output: ["导学课件", "课堂提纲", "随堂练习"]
  }
] as const;

const sources: Array<{
  key: string;
  label: string;
  icon: LucideIcon;
  sample: string;
}> = [
  {
    key: "text",
    label: "文案",
    icon: PenLine,
    sample: "把这段五年级科学笔记整理成 15 分钟亲子讲解。"
  },
  {
    key: "audio",
    label: "音视频",
    icon: FileAudio,
    sample: "上传课堂录音或视频字幕，生成分段导学课件。"
  },
  {
    key: "image",
    label: "图片",
    icon: FileImage,
    sample: "识别课本截图，生成重点讲解和练习题。"
  }
];

export function LearningWorkspace({ ctaHref }: { ctaHref: string }) {
  return (
    <div className="xueleai-workspace">
      <input className="xueleai-control-input" defaultChecked id="workspace-role-parent" name="workspace-role" type="radio" />
      <input className="xueleai-control-input" id="workspace-role-student" name="workspace-role" type="radio" />
      <input className="xueleai-control-input" id="workspace-role-teacher" name="workspace-role" type="radio" />
      <input className="xueleai-control-input" defaultChecked id="workspace-source-text" name="workspace-source" type="radio" />
      <input className="xueleai-control-input" id="workspace-source-audio" name="workspace-source" type="radio" />
      <input className="xueleai-control-input" id="workspace-source-image" name="workspace-source" type="radio" />

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="size-4 text-primary" />
          学习工坊
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
          <span className="size-2 rounded-full bg-primary" />
          已就绪
        </span>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-3">
        {roles.map((role) => (
          <label className="xueleai-choice" htmlFor={`workspace-role-${role.key}`} key={role.key}>
            <span>{role.label}</span>
            <span>{role.action}</span>
          </label>
        ))}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[0.92fr_1.08fr]">
        <div className="rounded-md border border-border bg-muted p-3">
          <div className="grid grid-cols-3 gap-2">
            {sources.map((source) => {
              const Icon = source.icon;

              return (
                <label className="xueleai-source-choice" htmlFor={`workspace-source-${source.key}`} key={source.key}>
                  <Icon className="mx-auto mb-1 size-4" />
                  {source.label}
                </label>
              );
            })}
          </div>
          <div className="mt-3 min-h-32 rounded-lg border border-input bg-card px-4 py-3 text-sm leading-6 text-foreground">
            {sources.map((source) => (
              <p className="xueleai-source-sample" data-source={source.key} key={source.key}>
                {source.sample}
              </p>
            ))}
          </div>
        </div>

        <div className="flex flex-col rounded-md border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-muted-foreground">即时预览</p>
              {roles.map((role) => (
                <h2 className="xueleai-role-title mt-1 text-xl font-bold" data-role={role.key} key={role.key}>
                  {role.label}{role.action} · 学习任务
                </h2>
              ))}
            </div>
            <Wand2 className="size-5 text-accent" />
          </div>

          {roles.map((role) => (
            <div className="xueleai-role-panel mt-4 flex-col gap-2" data-role={role.key} key={role.key}>
              {role.output.map((item, index) => (
                <div className="group flex items-center justify-between rounded-md border border-border bg-background px-3 py-3" key={item}>
                  <span className="flex items-center gap-3 text-sm font-semibold">
                    <span className="flex size-6 items-center justify-center rounded-full bg-secondary text-xs text-primary">
                      {index + 1}
                    </span>
                    {item}
                  </span>
                  <Check className="size-4 text-primary opacity-70 transition-opacity group-hover:opacity-100" />
                </div>
              ))}
              <div className="mt-auto flex flex-wrap gap-2 pt-5">
                <Button asChild>
                  <Link href={ctaHref}>
                    开始处理
                    <ArrowRight data-icon="inline-end" />
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href={role.href}>
                    打开{role.action}
                    <BookOpenText data-icon="inline-end" />
                  </Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
