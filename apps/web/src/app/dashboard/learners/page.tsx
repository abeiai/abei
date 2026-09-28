import { LearnerManager } from "@/components/profiles/learner-manager";
import { DashboardShell } from "@/components/shell/dashboard-shell";
import {
  getLearners,
  getProfileSelection,
  requireAccountProfile
} from "@/lib/profile-api";

export const dynamic = "force-dynamic";

export default async function LearnersPage() {
  const grades = await requireAccountProfile("/dashboard/learners");
  const [selection, learners] = await Promise.all([
    getProfileSelection("/dashboard/learners"),
    getLearners()
  ]);

  return (
    <DashboardShell
      active="knowledge"
      activeHref="/dashboard/learners"
      continuation="/dashboard/learners"
    >
      <LearnerManager
        account={selection.account}
        grades={grades}
        learners={learners}
      />
    </DashboardShell>
  );
}
