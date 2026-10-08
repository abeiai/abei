import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PictureBookGuideConsole } from "@/components/experience/picture-book-guide-console";
import { PublicShell } from "@/components/shell/public-shell";
import { getOptionalCurrentUser } from "@/lib/auth-actions";
import { getWebProfile } from "@/lib/profile-api";
import { profileSelectionHref } from "@/lib/profile-routing";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "绘本导读 - 阿贝智能", description: "上传 PDF 绘本，选择适用对象和带读风格，逐页生成带读文稿与语音。" };

export default async function PictureBookGuidePage({ searchParams }: { searchParams: Promise<{ guide?: string }> }) {
  const [user, params] = await Promise.all([getOptionalCurrentUser(), searchParams]);
  const returnPath = params.guide ? `/picture-book-guide?guide=${encodeURIComponent(params.guide)}` : "/picture-book-guide";
  if (user) {
    const profile = await getWebProfile(returnPath);
    if (profile.mode !== "ACCOUNT") redirect(profileSelectionHref(returnPath));
  }
  return <PublicShell currentUser={user} showFooter={false}><PictureBookGuideConsole signedIn={Boolean(user)} initialGuideId={params.guide ?? ""} /></PublicShell>;
}
