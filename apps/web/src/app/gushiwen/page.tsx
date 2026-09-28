import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { guardLearnerScenarioEntry } from "@/lib/profile-api";
import { createToolCreatorId, gushiwenCreatorPath } from "@/lib/tool-creator-routes";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "学古诗文 - 学乐 AI",
  description: "上传古诗词或古文，按学段年级生成背景讲解、逐句带学、诵读和背诵引导。"
};

export default async function GushiwenPage() {
  await guardLearnerScenarioEntry("/gushiwen");
  redirect(gushiwenCreatorPath(createToolCreatorId()));
}
