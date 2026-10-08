import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VideoBooksConsole } from "@/components/experience/video-books-console";
import { PublicShell } from "@/components/shell/public-shell";
import { getOptionalCurrentUser } from "@/lib/auth-actions";
import { getExperienceImageModels, getExperienceVideoModels } from "@/lib/experience-api";
import { getWebProfile } from "@/lib/profile-api";
import { profileSelectionHref } from "@/lib/profile-routing";
import { videoBookModels } from "@/lib/video-books";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "绘本转视频 - 阿贝智能", description: "上传绘本文档或选择本站绘本，以每页图片作为首帧，逐页编辑并生成视频。" };

export default async function VideoBooksPage({ searchParams }: { searchParams: Promise<{ book?: string }> }) {
  const [user, params] = await Promise.all([getOptionalCurrentUser(), searchParams]);
  const returnPath = params.book ? `/video-books?book=${encodeURIComponent(params.book)}` : "/video-books";
  if (user) {
    const profile = await getWebProfile(returnPath);
    if (profile.mode !== "ACCOUNT") redirect(profileSelectionHref(returnPath));
  }
  const [models, imageModels] = await Promise.all([getExperienceVideoModels(), getExperienceImageModels()]);
  return <PublicShell currentUser={user} showFooter={false}><VideoBooksConsole key={user?.id ?? "guest"} userId={user?.id ?? ""} initialBookId={params.book ?? ""} models={videoBookModels(models)} imageModels={imageModels} /></PublicShell>;
}
