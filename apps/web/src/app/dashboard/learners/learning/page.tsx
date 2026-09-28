import { AccountLearningDashboard } from "@/components/learning/account-learning-dashboard";
import { DashboardShell } from "@/components/shell/dashboard-shell";
import {
  getAccountLearnerLearningMaterials,
  getAccountLearnerLearningOverview,
  getAccountLearnerMaterialDetail
} from "@/lib/learner-learning-api";
import type { AccountLearnerLearningFilters, LearningMaterialType } from "@/lib/learner-learning-types";
import { getLearners, requireAccountProfile } from "@/lib/profile-api";

export const dynamic = "force-dynamic";

const path = "/dashboard/learners/learning";
const materialTypes = new Set<LearningMaterialType>(["VIDEO_GUIDE", "ENGLISH_GUIDED_STUDY", "LEARNING_FLASHCARD"]);

export default async function AccountLearnerLearningPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAccountProfile(path);
  const [query, learners] = await Promise.all([searchParams, getLearners()]);
  const activeLearners = learners.filter((learner) => learner.status === "ACTIVE");
  if (!activeLearners.length) {
    return <DashboardShell active="knowledge" continuation={path}><div className="mx-auto max-w-4xl px-5 py-10"><h1 className="text-2xl font-semibold tracking-normal">学习情况</h1><p className="mt-6 rounded-2xl border border-dashed border-border p-8 text-sm text-muted-foreground">暂无学习者</p></div></DashboardShell>;
  }
  const learnerId = first(query.learnerId) ?? activeLearners[0]!.id;
  const materialTypeValue = first(query.materialType);
  const filters: AccountLearnerLearningFilters = {
    from: first(query.from),
    to: first(query.to),
    scenarioId: first(query.scenarioId),
    courseId: first(query.courseId),
    resourceType: first(query.resourceType),
    resourceId: first(query.resourceId),
    materialType: materialTypeValue && materialTypes.has(materialTypeValue as LearningMaterialType) ? materialTypeValue as LearningMaterialType : undefined,
    materialId: first(query.materialId)
  };
  try {
    const [overview, materials] = await Promise.all([
      getAccountLearnerLearningOverview(learnerId, filters),
      getAccountLearnerLearningMaterials(learnerId, filters)
    ]);
    const detail = filters.materialType && filters.materialId
      ? await getAccountLearnerMaterialDetail(learnerId, filters.materialType, filters.materialId)
      : null;
    return <DashboardShell active="knowledge" continuation={path}><AccountLearningDashboard detail={detail} filters={filters} learners={activeLearners} materials={materials} overview={overview} selectedLearnerId={learnerId} /></DashboardShell>;
  } catch (error) {
    const message = error instanceof Error ? error.message : "学习情况加载失败，请稍后再试";
    return <DashboardShell active="knowledge" continuation={path}><div className="mx-auto max-w-4xl px-5 py-10"><h1 className="text-2xl font-semibold tracking-normal">学习情况</h1><p className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">{message}</p></div></DashboardShell>;
  }
}

function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
