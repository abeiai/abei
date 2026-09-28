import type { Metadata } from "next";

import { EnglishGuidedStudyConsole } from "@/components/experience/english-guided-study-console";
import { PublicShell } from "@/components/shell/public-shell";
import { getOptionalCurrentUser } from "@/lib/auth-actions";
import { guardLearnerScenarioEntry } from "@/lib/profile-api";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "制作英文带学 - 学乐 AI",
  description: "上传图片或粘贴英文文本，生成逐句讲解、同步音频和练习题。"
};

export default async function Text2LessonCreatorPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await guardLearnerScenarioEntry(`/text2lesson/creator/${encodeURIComponent(id)}`);
  const currentUser = await getOptionalCurrentUser();

  return (
    <PublicShell currentUser={currentUser} showFooter={false}>
      <EnglishGuidedStudyConsole creatorId={id} currentUser={currentUser} />
    </PublicShell>
  );
}
