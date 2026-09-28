import { LearnerAuthorizationForm } from "@/components/profiles/learner-authorization-form";
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

type ApplicationAuthorizationSearchParams = Record<string, string | string[] | undefined>;

export default async function LearnerApplicationAuthorizationPage({
  searchParams = Promise.resolve({})
}: {
  searchParams?: Promise<ApplicationAuthorizationSearchParams>;
} = {}) {
  const path = "/dashboard/learners/apps";
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
          description="设置学习账号可以使用的应用"
          title="应用授权"
        />
        {selectedLearner && authorizations ? (
          <>
            <LearnerAccountPicker
              action={path}
              learners={learners}
              selectedLearnerId={selectedLearner.id}
            />
            <LearnerAuthorizationForm
              authorizations={authorizations}
              key={selectedLearner.id}
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
