import type { Metadata } from "next";

import { LearnerHome } from "@/components/profiles/learner-home";
import { LearnerShell } from "@/components/shell/learner-shell";
import { getProfileSelection, requireLearnerProfile } from "@/lib/profile-api";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "学习首页 - 学乐 AI",
  description: "查看当前学习者可用的场景应用、专辑和最近学习记录。"
};

export default async function LearnPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ error }, home] = await Promise.all([
    searchParams,
    requireLearnerProfile("/learn")
  ]);
  const selection = await getProfileSelection("/learn");
  const safeError = error === "当前学习者未获得此应用授权" ? error : "";

  return (
    <LearnerShell home={home} selection={selection}>
      {safeError ? (
        <div className="mx-auto w-full max-w-6xl px-5 pt-5">
          <p className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {safeError}
          </p>
        </div>
      ) : null}
      <LearnerHome home={home} />
    </LearnerShell>
  );
}
