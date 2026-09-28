import type { Metadata } from "next";

import { VideoGuideConsole } from "@/components/experience/video-guide-console";
import { PublicShell } from "@/components/shell/public-shell";
import { getOptionalCurrentUser } from "@/lib/auth-actions";
import { guardLearnerScenarioEntry } from "@/lib/profile-api";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "制作视频导学 - 学乐 AI",
  description: "上传视频或音频与字幕文件，生成可分享的 AI 导学课件。"
};

export default async function MediaTutorCreatorPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await guardLearnerScenarioEntry(`/media-tutor/creator/${encodeURIComponent(id)}`);
  const currentUser = await getOptionalCurrentUser();

  return (
    <PublicShell currentUser={currentUser} showFooter={false}>
      <VideoGuideConsole
        key={currentUser?.id ?? "guest"}
        creatorId={id}
        currentUser={currentUser}
      />
    </PublicShell>
  );
}
