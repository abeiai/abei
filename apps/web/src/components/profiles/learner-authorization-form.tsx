"use client";

import { BookOpen, Check, Info, X } from "lucide-react";
import { useActionState, useEffect, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { replaceLearnerAuthorizationsAction } from "@/lib/profile-actions";
import type {
  LearnerAuthorizationOptions,
  LearnerAuthorizations,
  ProfileActionState
} from "@/lib/profile-api";

const initialState: ProfileActionState = {};

export type AuthorizationStatusFilter = "ALL" | "AUTHORIZED" | "UNAUTHORIZED";
export type AuthorizationCourseFilter = AuthorizationStatusFilter;
export type AuthorizationApplicationTypeFilter = "ALL" | "EXPERIENCE" | "SCENARIO";

const authorizationApplicationCatalog = new Map<string, {
  label: string;
  type: Exclude<AuthorizationApplicationTypeFilter, "ALL">;
}>([
  ["experience-ai-chat", { label: "AI问答", type: "EXPERIENCE" }],
  ["experience-image-generation", { label: "图片生成", type: "EXPERIENCE" }],
  ["experience-video-generation", { label: "视频生成", type: "EXPERIENCE" }],
  ["article-to-speech", { label: "语音合成", type: "EXPERIENCE" }],
  ["video-guide-narration", { label: "视频导学", type: "SCENARIO" }],
  ["english-guided-study-material", { label: "英文带学", type: "SCENARIO" }],
  ["gushiwen-guided-study-material", { label: "学古诗文", type: "SCENARIO" }],
  ["learning-flashcards-deck", { label: "学习闪卡", type: "SCENARIO" }],
  ["zitie", { label: "字帖生成", type: "SCENARIO" }],
  ["daodu", { label: "开卷导读", type: "SCENARIO" }],
  ["typing", { label: "打字记词", type: "SCENARIO" }]
]);

export function normalizeAuthorizationSelection(
  scenarioIds: readonly string[],
  courseIds: readonly string[]
) {
  return { scenarioIds: [...scenarioIds], courseIds: [...courseIds] };
}

export function filterAuthorizationCourses<TCourse extends { id: string }>(
  courses: readonly TCourse[],
  authorizedIds: readonly string[],
  filter: AuthorizationCourseFilter
) {
  if (filter === "ALL") return [...courses];

  const authorized = new Set(authorizedIds);
  return courses.filter((course) =>
    filter === "AUTHORIZED" ? authorized.has(course.id) : !authorized.has(course.id)
  );
}

export function filterAuthorizationScenarios<TScenario extends { id: string }>(
  scenarios: readonly TScenario[],
  authorizedIds: readonly string[],
  filter: AuthorizationStatusFilter,
  typeFilter: AuthorizationApplicationTypeFilter = "ALL"
) {
  const authorized = new Set(authorizedIds);
  return scenarios.filter((scenario) => {
    const authorizationMatches = filter === "ALL"
      || (filter === "AUTHORIZED" ? authorized.has(scenario.id) : !authorized.has(scenario.id));
    const slug = "slug" in scenario && typeof scenario.slug === "string" ? scenario.slug : "";
    const applicationType = authorizationApplicationType(slug);
    const typeMatches = applicationType !== null
      && (typeFilter === "ALL" || applicationType === typeFilter);

    return authorizationMatches && typeMatches;
  });
}

export function authorizationApplicationType(slug: string) {
  return authorizationApplicationCatalog.get(slug)?.type ?? null;
}

export function authorizationApplicationLabel(scenario: { name: string; slug: string }) {
  return authorizationApplicationCatalog.get(scenario.slug)?.label ?? scenario.name;
}

export function toggleCourseAuthorization(
  authorizations: LearnerAuthorizations,
  courseId: string
): LearnerAuthorizations {
  const authorized = authorizations.courseIds.includes(courseId);

  return {
    scenarioIds: [...authorizations.scenarioIds],
    courseIds: authorized
      ? authorizations.courseIds.filter((id) => id !== courseId)
      : [...authorizations.courseIds, courseId]
  };
}

export function toggleScenarioAuthorization(
  authorizations: LearnerAuthorizations,
  scenarioId: string
): LearnerAuthorizations {
  const authorized = authorizations.scenarioIds.includes(scenarioId);

  return {
    scenarioIds: authorized
      ? authorizations.scenarioIds.filter((id) => id !== scenarioId)
      : [...authorizations.scenarioIds, scenarioId],
    courseIds: [...authorizations.courseIds]
  };
}

export function LearnerAuthorizationForm({
  authorizations,
  learnerId,
  options
}: {
  authorizations: LearnerAuthorizations;
  learnerId: string;
  options: LearnerAuthorizationOptions;
}) {
  const [state, formAction, pending] = useActionState(
    replaceLearnerAuthorizationsAction,
    initialState
  );
  const [filter, setFilter] = useState<AuthorizationStatusFilter>("ALL");
  const [typeFilter, setTypeFilter] = useState<AuthorizationApplicationTypeFilter>("ALL");
  const [selectedScenarioIds, setSelectedScenarioIds] = useState(authorizations.scenarioIds);

  useEffect(() => {
    setSelectedScenarioIds(authorizations.scenarioIds);
  }, [authorizations.scenarioIds]);

  const visibleScenarios = filterAuthorizationScenarios(
    options.scenarios,
    selectedScenarioIds,
    filter,
    typeFilter
  );

  function toggleScenario(scenarioId: string) {
    setSelectedScenarioIds((current) =>
      toggleScenarioAuthorization(
        { scenarioIds: current, courseIds: authorizations.courseIds },
        scenarioId
      ).scenarioIds
    );
  }

  return (
    <form action={formAction} className="space-y-5 rounded-2xl border border-border bg-background p-5 shadow-sm">
      <input name="learnerId" type="hidden" value={learnerId} />
      {authorizations.courseIds.map((courseId) => (
        <input key={courseId} name="courseIds" type="hidden" value={courseId} />
      ))}
      {selectedScenarioIds.map((scenarioId) => (
        <input key={scenarioId} name="scenarioIds" type="hidden" value={scenarioId} />
      ))}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-[#f7f7f6] px-4 py-3">
        <div className="flex items-center gap-2">
          <p className="text-sm text-muted-foreground">
            共 {options.scenarios.length} 个应用，已授权 {selectedScenarioIds.length} 个
          </p>
          <span className="group relative inline-flex">
            <button
              aria-describedby={`application-authorization-help-${learnerId}`}
              aria-label="查看应用授权说明"
              className="rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/35"
              type="button"
            >
              <Info className="size-4" />
            </button>
            <span
              className="pointer-events-none absolute left-1/2 top-6 z-20 hidden w-56 -translate-x-1/2 rounded-lg bg-foreground px-3 py-2 text-xs leading-5 text-background shadow-lg group-hover:block group-focus-within:block"
              id={`application-authorization-help-${learnerId}`}
              role="tooltip"
            >
              勾选后，该学习账号才能使用对应应用；允许全部不选。
            </span>
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select
            aria-label="按应用类型筛选"
            className="w-36 bg-background"
            onChange={(event) => setTypeFilter(event.target.value as AuthorizationApplicationTypeFilter)}
            value={typeFilter}
          >
            <option value="ALL">全部类型</option>
            <option value="EXPERIENCE">体验应用</option>
            <option value="SCENARIO">场景应用</option>
          </Select>
          <Select
            aria-label="按授权状态筛选"
            className="w-36 bg-background"
            onChange={(event) => setFilter(event.target.value as AuthorizationStatusFilter)}
            value={filter}
          >
            <option value="ALL">全部状态</option>
            <option value="AUTHORIZED">已授权</option>
            <option value="UNAUTHORIZED">未授权</option>
          </Select>
        </div>
      </div>
      <ApplicationAuthorizationFields
        onToggle={toggleScenario}
        scenarios={visibleScenarios}
        selectedScenarioIds={selectedScenarioIds}
      />
      <ActionMessage state={state} />
      <Button disabled={pending} size="sm" type="submit">
        {pending ? "保存中…" : "保存应用授权"}
      </Button>
    </form>
  );
}

export function ApplicationAuthorizationFields({
  onToggle,
  scenarios,
  selectedScenarioIds
}: {
  onToggle: (scenarioId: string) => void;
  scenarios: LearnerAuthorizationOptions["scenarios"];
  selectedScenarioIds: string[];
}) {
  return (
    <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <legend className="sr-only">应用</legend>
      {scenarios.length ? (
        scenarios.map((scenario) => (
          <label
            className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-4 text-sm outline-none transition-colors hover:border-primary/35 focus-within:ring-[3px] focus-within:ring-ring/25"
            key={scenario.id}
          >
            <input
              className="mt-0.5 size-4 accent-primary"
              checked={selectedScenarioIds.includes(scenario.id)}
              onChange={() => onToggle(scenario.id)}
              type="checkbox"
            />
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{authorizationApplicationLabel(scenario)}</span>
                <Badge variant="muted">
                  {authorizationApplicationType(scenario.slug) === "EXPERIENCE" ? "体验应用" : "场景应用"}
                </Badge>
              </span>
              {scenario.description ? (
                <span className="mt-1 line-clamp-2 block text-xs leading-5 text-muted-foreground">
                  {scenario.description}
                </span>
              ) : null}
            </span>
          </label>
        ))
      ) : (
        <p className="text-sm text-muted-foreground">没有符合当前筛选条件的应用</p>
      )}
    </fieldset>
  );
}

export function LearnerResourceAuthorization({
  authorizations,
  learnerId,
  options
}: {
  authorizations: LearnerAuthorizations;
  learnerId: string;
  options: LearnerAuthorizationOptions;
}) {
  const [filter, setFilter] = useState<AuthorizationCourseFilter>("ALL");
  const [authorizedCourseIds, setAuthorizedCourseIds] = useState(authorizations.courseIds);
  const [feedback, setFeedback] = useState<ProfileActionState>({});
  const [savingCourseId, setSavingCourseId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setAuthorizedCourseIds(authorizations.courseIds);
  }, [authorizations.courseIds]);

  const visibleCourses = filterAuthorizationCourses(options.courses, authorizedCourseIds, filter);
  const authorizedCount = options.courses.filter((course) => authorizedCourseIds.includes(course.id)).length;

  function updateCourseAuthorization(courseId: string) {
    const next = toggleCourseAuthorization(
      { scenarioIds: authorizations.scenarioIds, courseIds: authorizedCourseIds },
      courseId
    );
    const formData = new FormData();
    formData.set("learnerId", learnerId);
    next.scenarioIds.forEach((scenarioId) => formData.append("scenarioIds", scenarioId));
    next.courseIds.forEach((authorizedCourseId) => formData.append("courseIds", authorizedCourseId));

    setFeedback({});
    setSavingCourseId(courseId);
    startTransition(async () => {
      const result = await replaceLearnerAuthorizationsAction({}, formData);

      if (result.error) {
        setFeedback({ error: result.error });
      } else {
        setAuthorizedCourseIds(next.courseIds);
        setFeedback({ success: next.courseIds.includes(courseId) ? "资源已授权" : "已取消资源授权" });
      }
      setSavingCourseId(null);
    });
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-[#f7f7f6] px-4 py-3">
        <p className="text-sm text-muted-foreground">
          共 {options.courses.length} 门资源，已授权 {authorizedCount} 门
        </p>
        <Select
          aria-label="按授权状态筛选"
          className="w-40 bg-background"
          onChange={(event) => setFilter(event.target.value as AuthorizationCourseFilter)}
          value={filter}
        >
          <option value="ALL">全部资源</option>
          <option value="AUTHORIZED">已授权</option>
          <option value="UNAUTHORIZED">未授权</option>
        </Select>
      </div>

      <ActionMessage state={feedback} />

      {visibleCourses.length ? (
        <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visibleCourses.map((course) => {
            const authorized = authorizedCourseIds.includes(course.id);
            const saving = pending && savingCourseId === course.id;

            return (
              <article className="overflow-hidden rounded-xl border border-border bg-background" key={course.id}>
                <div className="relative aspect-video overflow-hidden bg-secondary">
                  {course.coverUrl ? (
                    <img alt={`${course.name}课程封面`} className="size-full object-cover" src={course.coverUrl} />
                  ) : (
                    <div className="flex size-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                      <BookOpen className="size-6" />
                      <span>暂无封面</span>
                    </div>
                  )}
                  <Button
                    aria-label={authorized ? `取消授权${course.name}` : `授权${course.name}`}
                    aria-pressed={authorized}
                    className="absolute right-3 top-3 h-8 px-3 shadow-sm"
                    disabled={pending}
                    onClick={() => updateCourseAuthorization(course.id)}
                    size="sm"
                    type="button"
                    variant={authorized ? "outline" : "default"}
                  >
                    {authorized ? <X /> : <Check />}
                    {saving ? "处理中…" : authorized ? "取消" : "授权"}
                  </Button>
                </div>
                <div className="flex min-h-36 flex-col px-4 pb-4 pt-3">
                  <h3 className="truncate text-base font-semibold leading-6">{course.name}</h3>
                  <p className="mt-0.5 line-clamp-2 text-sm leading-6 text-muted-foreground">
                    {course.summary || "暂无课程简介"}
                  </p>
                  {course.tags.length ? (
                    <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
                      {course.tags.slice(0, 3).map((tag) => (
                        <Badge key={tag} variant="muted">{tag}</Badge>
                      ))}
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border px-5 py-12 text-center text-sm text-muted-foreground">
          {options.courses.length ? "没有符合当前筛选条件的资源" : "暂无可授权资源"}
        </div>
      )}
    </section>
  );
}

function ActionMessage({ state }: { state: ProfileActionState }) {
  if (!state.error && !state.success) return null;

  return (
    <p aria-live="polite" className={state.error ? "text-sm text-destructive" : "text-sm text-foreground"}>
      {state.error ?? state.success}
    </p>
  );
}
