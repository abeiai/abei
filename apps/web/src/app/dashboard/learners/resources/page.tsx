import { LearnerResourceAuthorization } from "@/components/profiles/learner-authorization-form";
import {
  LearnerAccountPicker,
  LearnerManagementHeader,
  NoLearnerAccounts
} from "@/components/profiles/learner-management-section";
import { DashboardShell } from "@/components/shell/dashboard-shell";
import {
  getLearnerAuthorizationOptions,
  getLearnerAuthorizations,
  getLearners,
  requireAccountProfile
} from "@/lib/profile-api";

export const dynamic = "force-dynamic";

type ResourceAuthorizationSearchParams = Record<string, string | string[] | undefined>;

export default async function LearnerResourceAuthorizationPage({
  searchParams = Promise.resolve({})
}: {
  searchParams?: Promise<ResourceAuthorizationSearchParams>;
} = {}) {
  const path = "/dashboard/learners/resources";
  await requireAccountProfile(path);
  const [learners, options, params] = await Promise.all([
    getLearners(),
    getLearnerAuthorizationOptions(),
    searchParams
  ]);
  const requestedLearnerId = typeof params.learnerId === "string" ? params.learnerId : "";
  const selectedLearner = learners.find((learner) => learner.id === requestedLearnerId)
    ?? learners.find((learner) => learner.status === "ACTIVE")
    ?? learners[0];
  const authorizations = selectedLearner
    ? await getLearnerAuthorizations(selectedLearner.id)
    : null;

  return (
    <DashboardShell active="knowledge" activeHref={path} continuation={path}>
      <div className="mx-auto w-full max-w-7xl space-y-6 px-5 py-8 md:px-8">
        <LearnerManagementHeader
          description="设置学习账号可以使用的学习资源"
          title="资源授权"
        />
        {selectedLearner && authorizations ? (
          <>
            <LearnerAccountPicker
              action={path}
              learners={learners}
              selectedLearnerId={selectedLearner.id}
            />
            <LearnerResourceAuthorization
              authorizations={authorizations}
              learnerId={selectedLearner.id}
              options={options}
            />
          </>
        ) : (
          <NoLearnerAccounts />
        )}
      </div>
    </DashboardShell>
  );
}
