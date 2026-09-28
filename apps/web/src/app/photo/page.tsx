import type { Metadata } from "next";
import { StudentPhotoConsole } from "@/components/photo/student-photo-console";
import { PublicShell } from "@/components/shell/public-shell";
import { getOptionalCurrentUser } from "@/lib/auth-actions";
import { getExperienceImageModels } from "@/lib/experience-api";
import { guardLearnerScenarioEntry } from "@/lib/profile-api";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "照片处理 - 学乐 AI",
  description: "制作学生证照，选择服装、尺寸和背景颜色。"
};

export default async function PhotoPage() {
  const user = await getOptionalCurrentUser();
  if (user) await guardLearnerScenarioEntry("/photo");
  const models = await getExperienceImageModels();
  return <PublicShell currentUser={user} showFooter={false}><StudentPhotoConsole currentUser={user} models={models} /></PublicShell>;
}
