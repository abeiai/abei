import type { Metadata } from "next";

import { ReadingGuideConsole } from "@/components/experience/reading-guide-console";
import { PublicShell } from "@/components/shell/public-shell";
import { getOptionalCurrentUser } from "@/lib/auth-actions";
import { getWebProfile, guardLearnerScenarioEntry } from "@/lib/profile-api";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "制作开卷导读 - 学乐 AI",
  description: "生成一篇完整的中文阅读导读文稿、整篇讲解音频和同步练习。"
};

export default async function ReadingGuideCreatorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const path = `/daodu/creator/${encodeURIComponent(id)}`;
  await guardLearnerScenarioEntry(path);
  const [currentUser, profile] = await Promise.all([getOptionalCurrentUser(), getWebProfile(path)]);

  return (
    <PublicShell currentUser={currentUser} showFooter={false}>
      <ReadingGuideConsole
        creatorId={id}
        currentUser={currentUser}
        initialGradeLabel={profile.mode === "LEARNER" ? profile.home.learner.gradeLabel : undefined}
      />
    </PublicShell>
  );
}
