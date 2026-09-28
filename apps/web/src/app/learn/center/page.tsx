import type { Metadata } from "next";

import { LearnerCenter } from "@/components/profiles/learner-center";
import { LearnerShell } from "@/components/shell/learner-shell";
import {
  getProfileSelection,
  requireLearnerProfile
} from "@/lib/profile-api";
import { getLearnerLearningOverview } from "@/lib/learner-learning-api";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "学习中心 - 学乐 AI",
  description: "查看学习者资料、已授权内容和基础学习情况。"
};

export default async function LearnerCenterPage() {
  const home = await requireLearnerProfile("/learn/center");
  const [selection, overview] = await Promise.all([
    getProfileSelection("/learn/center"),
    getLearnerLearningOverview()
  ]);

  return (
    <LearnerShell home={home} selection={selection}>
      <LearnerCenter home={home} overview={overview} />
    </LearnerShell>
  );
}
