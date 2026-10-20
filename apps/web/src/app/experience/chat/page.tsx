import type { Metadata } from "next";

import { AiChatConsole } from "@/components/experience/ai-chat-console";
import { getOptionalCurrentUser } from "@/lib/auth-actions";
import { getCurrentBillingIdentity } from "@/lib/billing-identity";
import { getExperienceChatModels } from "@/lib/experience-api";
import { getUserOrganizations } from "@/lib/organizations-api";
import { guardLearnerScenarioEntry } from "@/lib/profile-api";

export const metadata: Metadata = {
  title: "AI 对话体验 - 学乐 AI",
  description: "围绕学习材料整理、专辑讲解和练习设计使用基础 AI 对话能力。"
};

export default async function ExperienceChatPage() {
  const profile = await guardLearnerScenarioEntry("/experience/chat");
  const [models, currentUser] = await Promise.all([
    getExperienceChatModels(),
    getOptionalCurrentUser()
  ]);
  const organizations = currentUser && profile.mode === "ACCOUNT"
    ? await getUserOrganizations().catch(() => null)
    : null;
  const billingIdentity = currentUser && profile.mode === "ACCOUNT"
    ? await getCurrentBillingIdentity(organizations)
    : null;

  return (
    <AiChatConsole
      currentUser={currentUser}
      initialOrganizationId={billingIdentity?.organizationId ?? ""}
      models={models}
      organizations={organizations}
    />
  );
}
