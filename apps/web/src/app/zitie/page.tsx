import type { Metadata } from "next";

import { PublicShell } from "@/components/shell/public-shell";
import { ZitieGenerator } from "@/components/zitie/zitie-generator";
import { getOptionalCurrentUser } from "@/lib/auth-actions";
import { guardLearnerScenarioEntry } from "@/lib/profile-api";
import { shouldGuardZitieScenario } from "@/lib/zitie-access";

export const metadata: Metadata = {
  title: "字帖生成器 - 学乐 AI",
  description: "输入汉字和拼音，生成 A4 田字格或方格字帖，并导出 PDF。"
};

export default async function ZitiePage() {
  const currentUser = await getOptionalCurrentUser();

  if (shouldGuardZitieScenario(Boolean(currentUser))) {
    await guardLearnerScenarioEntry("/zitie");
  }

  return (
    <PublicShell currentUser={currentUser} showFooter={false}>
      <ZitieGenerator isAuthenticated={Boolean(currentUser)} />
    </PublicShell>
  );
}
