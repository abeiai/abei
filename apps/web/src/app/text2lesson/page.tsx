import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { createToolCreatorId, text2lessonCreatorPath } from "@/lib/tool-creator-routes";
import { guardLearnerScenarioEntry } from "@/lib/profile-api";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "英文带学 - 学乐 AI",
  description: "上传图片或粘贴英文文本，按英语水平生成逐句讲解、同步音频和练习题。"
};

export default async function Text2LessonPage() {
  await guardLearnerScenarioEntry("/text2lesson");
  redirect(text2lessonCreatorPath(createToolCreatorId()));
}
