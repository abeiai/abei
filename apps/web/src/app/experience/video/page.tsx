import type { Metadata } from "next";

import { VideoGenerationConsole } from "@/components/experience/video-generation-console";
import { getCurrentUser, getOptionalCurrentUser } from "@/lib/auth-actions";
import { getCurrentBillingIdentity } from "@/lib/billing-identity";
import { getExperienceVideoModels } from "@/lib/experience-api";
import { getUserOrganizations } from "@/lib/organizations-api";
import { guardLearnerScenarioEntry } from "@/lib/profile-api";
import { videoHistoryStorageKey } from "@/lib/video-generation-history";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "视频生成体验 - 学乐 AI",
  description: "围绕课程片段输入提示词、选择模型和参考文件，生成视频并查看历史记录。"
};

export default async function ExperienceVideoPage() {
  const profile = await guardLearnerScenarioEntry("/experience/video");
  const currentUserPromise = profile.mode === "GUEST"
    ? getOptionalCurrentUser()
    : getCurrentUser("/experience/video");
  const [models, currentUser] = await Promise.all([
    getExperienceVideoModels(),
    currentUserPromise
  ]);
  const organizations = currentUser && profile.mode === "ACCOUNT"
    ? await getUserOrganizations().catch(() => null)
    : null;
  const billingIdentity = currentUser && profile.mode === "ACCOUNT"
    ? await getCurrentBillingIdentity(organizations)
    : null;
  const historyStorageKey = profile.mode === "LEARNER" && currentUser
    ? videoHistoryStorageKey({
        mode: "LEARNER",
        userId: currentUser.id,
        learnerId: profile.home.learner.id
      })
    : currentUser
      ? videoHistoryStorageKey({ mode: "ACCOUNT", userId: currentUser.id })
      : videoHistoryStorageKey({ mode: "GUEST" });

  return (
    <VideoGenerationConsole
      currentUser={currentUser}
      historyStorageKey={historyStorageKey}
      initialOrganizationId={billingIdentity?.organizationId ?? ""}
      key={historyStorageKey}
      models={models}
      organizations={organizations}
    />
  );
}
