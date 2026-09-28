import type { Metadata } from "next";

import { EnglishGuidedStudyConsole } from "@/components/experience/english-guided-study-console";
import { PublicShell } from "@/components/shell/public-shell";
import { getOptionalCurrentUser } from "@/lib/auth-actions";
import { guardLearnerScenarioEntry } from "@/lib/profile-api";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "制作古诗文带学 - 学乐 AI",
  description: "上传古诗词或古文，按学段年级生成背景讲解、逐句带学、诵读和背诵引导。"
};

export default async function GushiwenCreatorPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await guardLearnerScenarioEntry(`/gushiwen/creator/${encodeURIComponent(id)}`);
  const currentUser = await getOptionalCurrentUser();

  return (
    <PublicShell currentUser={currentUser} showFooter={false}>
      <EnglishGuidedStudyConsole creatorId={id} currentUser={currentUser} scene="GUSHIWEN" />
    </PublicShell>
  );
}
