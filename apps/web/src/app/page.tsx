import { defaultOpenGraph } from "@/lib/share-metadata";
import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  AudioLines,
  BookOpenCheck,
  BrainCircuit,
  CheckCircle2,
  FileImage,
  FileText,
  Film,
  Layers3,
  LibraryBig,
  LockKeyhole,
  PlayCircle,
  Sparkles,
  UploadCloud,
  Wand2,
  type LucideIcon
} from "lucide-react";

import { PublicModuleRenderer } from "@/components/content-modules/public-module-renderer";
import { PublicShell } from "@/components/shell/public-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getPublicHomeComposition } from "@/lib/page-composition-api";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "学乐 AI - AI 学习材料与课程生成平台",
  description: "面向中小学生家庭、学生和教育内容团队，把文案、音视频、图片与教材资源转为可学习、可发布、可管理的课程材料。",
  openGraph: {
    ...defaultOpenGraph,
    title: "学乐 AI - AI 学习材料与课程生成平台",
    description: "把手头素材转为专业培训材料、导学课程、讲解音频和练习资源。",
    url: "/",
    type: "website"
  }
};

const sourceTypes = [
  { label: "文案资料", icon: FileText },
  { label: "音视频", icon: Film },
  { label: "图片素材", icon: FileImage },
  { label: "电子教材", icon: LibraryBig }
] satisfies Array<{ label: string; icon: LucideIcon }>;

const outputTypes = [
  "导学课程",
  "逐句讲解",
  "讲解音频",
  "练习与测评",
  "知识卡片",
  "家长辅学稿"
];

const workflows = [
  {
    title: "素材接入",
    description: "上传课文、课堂视频、练习图片或教材链接，保留来源和年级学科上下文。",
    icon: UploadCloud
  },
  {
    title: "AI 拆解",
    description: "识别知识点、难度层级、讲解节奏和适合学生的学习路径。",
    icon: BrainCircuit
  },
  {
    title: "课程生成",
    description: "生成导学讲稿、音频、练习、课件大纲和可复用的课程包。",
    icon: Wand2
  },
  {
    title: "交付沉淀",
    description: "保存任务记录、材料版本和学习资源，持续迭代成自己的内容资产。",
    icon: BookOpenCheck
  }
] satisfies Array<{ title: string; description: string; icon: LucideIcon }>;

const productPillars = [
  {
    title: "多模态素材工坊",
    description: "文案、字幕、图片、音频和视频进入同一个学习素材管线。",
    items: ["图片识别", "视频导学", "语音生成", "文本重写"]
  },
  {
    title: "课程化生成引擎",
    description: "不是把内容变长，而是把素材变成有目标、有节奏、有输出的学习任务。",
    items: ["讲解稿", "练习题", "知识卡", "复习路径"]
  },
  {
    title: "可运营 SaaS 底座",
    description: "面向真实业务运营，包含账户、点数、CMS、教材资源和后台管理。",
    items: ["用户中心", "点数消耗", "内容管理", "管理员后台"]
  }
] as const;

const roleCards = [
  {
    title: "家长",
    heading: "把孩子看不懂的材料，变成能一起讲的辅学脚本。",
    examples: ["课文讲解", "亲子提问", "错题思路"]
  },
  {
    title: "学生",
    heading: "把英文文本、课堂笔记和视频片段拆成可自学的步骤。",
    examples: ["逐句精讲", "跟读音频", "重点回看"]
  },
  {
    title: "内容团队",
    heading: "把素材库存转为标准课程包，缩短从资料到产品的周期。",
    examples: ["课程大纲", "训练材料", "内容发布"]
  }
] as const;

const trustItems = [
  { label: "账户与权限", value: "用户 / 管理员双体系" },
  { label: "内容运营", value: "CMS、教材、单页统一管理" },
  { label: "商业化预留", value: "支付宝、微信支付与点数体系" },
  { label: "AI 编排", value: "任务记录、消耗预估、结果回看" }
] as const;

export default async function HomePage() {
  const composition = await getPublicHomeComposition().catch(() => null);

  if (composition) {
    return (
      <PublicShell showFooter={composition.showFooter} showHeader={composition.showHeader}>
        <PublicModuleRenderer
          modules={[...composition.items]
            .sort((current, next) => current.sortOrder - next.sortOrder)
            .map((item) => item.module)}
        />
      </PublicShell>
    );
  }

  return <StandaloneHomePage />;
}

function StandaloneHomePage() {
  return (
    <PublicShell>
      <section className="home-saas-page">
        <div className="home-saas-hero">
          <div className="home-saas-hero-copy">
            <Badge>AI 学习运营平台</Badge>
            <div className="home-saas-title-block">
              <h1>
                <span>把学习素材</span>
                <span>变成课程资产</span>
              </h1>
              <p>
                学乐 AI 面向中小学生家庭、学生和教育内容团队，将文案、音视频、图片与教材资源转化为专业讲解、训练材料和可持续运营的课程资产。
              </p>
            </div>
            <div className="home-saas-actions">
              <Button asChild size="lg">
                <Link href="/register">
                  开始生成学习材料
                  <ArrowRight data-icon="inline-end" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/media-tutor">
                  查看视频导学
                  <PlayCircle data-icon="inline-end" />
                </Link>
              </Button>
            </div>
            <div className="home-saas-source-row" aria-label="支持的素材类型">
              {sourceTypes.map((source) => {
                const Icon = source.icon;

                return (
                  <span key={source.label}>
                    <Icon className="size-4" />
                    {source.label}
                  </span>
                );
              })}
            </div>
          </div>

          <ProductConsole />
        </div>

        <section className="home-saas-proof">
          <div>
            <span>2,700+</span>
            <p>电子教材资源可检索</p>
          </div>
          <div>
            <span>4 类</span>
            <p>核心素材输入方式</p>
          </div>
          <div>
            <span>6 种</span>
            <p>学习材料输出形态</p>
          </div>
          <div>
            <span>1 个</span>
            <p>面向运营的 SaaS 底座</p>
          </div>
        </section>

        <section className="home-saas-section home-saas-workflow-section">
          <SectionIntro
            eyebrow="工作流"
            title="素材到课程，一条工作流完成"
            description="平台把素材理解、内容生成、学习交付和资产沉淀放在同一条工作流里，让 AI 产出不只是一段回答，而是一套可以继续使用的学习材料。"
          />
          <div className="home-saas-workflow-grid">
            {workflows.map((item, index) => {
              const Icon = item.icon;

              return (
                <article className="home-saas-workflow-card" key={item.title}>
                  <span className="home-saas-step">{String(index + 1).padStart(2, "0")}</span>
                  <Icon className="size-6 text-primary" />
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="home-saas-section">
          <SectionIntro
            eyebrow="平台能力"
            title="面向真实学习场景的 AI SaaS 架构"
            description="这里不是单点 AI 工具集合，而是围绕“学习材料生产”建立的产品系统。"
          />
          <div className="home-saas-pillar-grid">
            {productPillars.map((pillar) => (
              <article className="home-saas-pillar" key={pillar.title}>
                <h3>{pillar.title}</h3>
                <p>{pillar.description}</p>
                <div>
                  {pillar.items.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="home-saas-section home-saas-split">
          <div>
            <SectionIntro
              eyebrow="应用场景"
              title="同一份素材，适配不同学习角色"
              description="同一份素材，可以被转成家长能讲、学生能练、团队能发布的多版本材料。"
            />
            <div className="home-saas-role-stack">
              {roleCards.map((role) => (
                <article className="home-saas-role-card" key={role.title}>
                  <span>{role.title}</span>
                  <h3>{role.heading}</h3>
                  <div>
                    {role.examples.map((item) => (
                      <Badge key={item} variant="outline">
                        {item}
                      </Badge>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>
          <div className="home-saas-output-board">
            <div className="home-saas-output-head">
              <Sparkles className="size-5 text-primary" />
              <span>材料输出矩阵</span>
            </div>
            <div className="home-saas-output-grid">
              {outputTypes.map((item, index) => (
                <div key={item}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{item}</strong>
                  <CheckCircle2 className="size-4 text-primary" />
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="home-saas-section home-saas-trust">
          <div className="home-saas-trust-copy">
            <Badge variant="outline">面向运营构建</Badge>
            <h2>从第一天就按可运营平台设计</h2>
            <p>
              面向商业化教育内容工具，首页背后对应的是账号、后台、CMS、点数和 AI 任务链路。设计表达的不只是“能生成”，而是“能长期运营”。
            </p>
          </div>
          <div className="home-saas-trust-grid">
            {trustItems.map((item) => (
              <div key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="home-saas-final">
          <div>
            <span>课程资产生产线</span>
            <h2>让每一份素材都进入课程化生产线</h2>
          </div>
          <div className="home-saas-actions">
            <Button asChild size="lg">
              <Link href="/register">
                免费开始
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/textbook">浏览教材资源</Link>
            </Button>
          </div>
        </section>
      </section>
    </PublicShell>
  );
}

function SectionIntro({
  description,
  eyebrow,
  title
}: {
  description: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <div className="home-saas-section-intro">
      <p>{eyebrow}</p>
      <h2>{title}</h2>
      <span>{description}</span>
    </div>
  );
}

function ProductConsole() {
  return (
    <div className="home-saas-console" aria-label="学乐 AI 产品操作台示意">
      <div className="home-saas-console-top">
        <span>学乐 AI 工作室</span>
        <div>
          <span />
          <span />
          <span />
        </div>
      </div>
      <div className="home-saas-console-body">
        <div className="home-saas-input-column">
          <div className="home-saas-console-label">
            <UploadCloud className="size-4" />
            素材输入
          </div>
          {[
            ["课堂视频", "38 min · 英语阅读"],
            ["教材截图", "三年级 · 数学"],
            ["课堂笔记", "知识点 12 条"]
          ].map(([title, meta]) => (
            <div className="home-saas-file-card" key={title}>
              <span>{title}</span>
              <small>{meta}</small>
            </div>
          ))}
        </div>

        <div className="home-saas-ai-core">
          <div className="home-saas-orbit">
            <BrainCircuit className="size-10" />
          </div>
          <p>AI 课程引擎</p>
          <span>识别目标 · 拆解知识点 · 生成材料</span>
        </div>

        <div className="home-saas-output-column">
          <div className="home-saas-console-label">
            <Layers3 className="size-4" />
            课程输出
          </div>
          {[
            { title: "15 分钟导学课", icon: Film },
            { title: "逐句讲解音频", icon: AudioLines },
            { title: "分层练习题", icon: BookOpenCheck },
            { title: "家长辅学稿", icon: LockKeyhole }
          ].map((item) => {
            const Icon = item.icon;

            return (
              <div className="home-saas-output-item" key={item.title}>
                <Icon className="size-4" />
                <span>{item.title}</span>
                <CheckCircle2 className="size-4" />
              </div>
            );
          })}
        </div>
      </div>
      <div className="home-saas-console-footer">
        <span>任务完成</span>
        <div>
          <span style={{ width: "82%" }} />
        </div>
        <strong>82%</strong>
      </div>
    </div>
  );
}
