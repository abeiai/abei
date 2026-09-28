import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { guardLearnerScenarioEntry } from "@/lib/profile-api";
import { createToolCreatorId, daoduCreatorPath } from "@/lib/tool-creator-routes";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "开卷导读 - 学乐 AI",
  description: "提交中文阅读内容或文档，按学习者学段年级和学习时间生成完整导读、讲解音频与同步练习。"
};

export default async function ReadingGuidePage() {
  await guardLearnerScenarioEntry("/daodu");
  redirect(daoduCreatorPath(createToolCreatorId()));
}
