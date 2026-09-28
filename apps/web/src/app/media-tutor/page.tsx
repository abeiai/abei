import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { createToolCreatorId, mediaTutorCreatorPath } from "@/lib/tool-creator-routes";
import { guardLearnerScenarioEntry } from "@/lib/profile-api";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "视频导学 - 学乐 AI",
  description: "上传视频或音频与字幕文件，生成可分享的 AI 导学课件。"
};

export default async function MediaTutorPage() {
  await guardLearnerScenarioEntry("/media-tutor");
  redirect(mediaTutorCreatorPath(createToolCreatorId()));
}
