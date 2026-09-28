import {
  LearnerAccountPicker,
  LearnerDataPlaceholder,
  LearnerManagementHeader,
  NoLearnerAccounts
} from "@/components/profiles/learner-management-section";
import { DashboardShell } from "@/components/shell/dashboard-shell";
import { getLearners, requireAccountProfile } from "@/lib/profile-api";

export const dynamic = "force-dynamic";

type LearnerDataSearchParams = Record<string, string | string[] | undefined>;

export default async function LearnerDataPage({
  searchParams = Promise.resolve({})
}: {
  searchParams?: Promise<LearnerDataSearchParams>;
} = {}) {
  const path = "/dashboard/learners/data";
  await requireAccountProfile(path);
  const [learners, params] = await Promise.all([getLearners(), searchParams]);
  const requestedLearnerId = typeof params.learnerId === "string" ? params.learnerId : "";
  const selectedLearner = learners.find((learner) => learner.id === requestedLearnerId)
    ?? learners.find((learner) => learner.status === "ACTIVE")
    ?? learners[0];

  return (
    <DashboardShell active="knowledge" activeHref={path} continuation={path}>
      <div className="mx-auto w-full max-w-5xl space-y-6 px-5 py-8 md:px-8">
        <LearnerManagementHeader title="学习数据" />
        {selectedLearner ? (
          <>
            <LearnerAccountPicker
              action={path}
              learners={learners}
              selectedLearnerId={selectedLearner.id}
            />
            <LearnerDataPlaceholder learner={selectedLearner} />
          </>
        ) : (
          <NoLearnerAccounts />
        )}
      </div>
    </DashboardShell>
  );
}
