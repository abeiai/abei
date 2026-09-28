import Link from "next/link";
import { BarChart3 } from "lucide-react";

import type { ProfileSelectionLearner } from "@/lib/profile-api";
import { cn } from "@/lib/utils";

export function LearnerManagementHeader({
  description,
  title
}: {
  description?: string;
  title: string;
}) {
  return (
    <header>
      <h2 className="text-2xl font-semibold tracking-normal">{title}</h2>
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
    </header>
  );
}

export function LearnerAccountPicker({
  action,
  learners,
  selectedLearnerId
}: {
  action: string;
  learners: ProfileSelectionLearner[];
  selectedLearnerId: string;
}) {
  const items = learnerAccountPickerItems(action, learners, selectedLearnerId);

  return (
    <nav aria-label="选择学习账号" className="space-y-2">
      <p className="text-sm font-semibold">学习账号</p>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {learners.map((learner, index) => {
          const item = items[index];

          return (
            <Link
              aria-current={item?.selected ? "page" : undefined}
              className={cn(
                "flex min-w-28 shrink-0 items-center gap-3 rounded-xl border px-3 py-2.5 transition-all",
                item?.selected
                  ? "border-primary bg-secondary text-foreground shadow-sm"
                  : "border-border bg-background text-muted-foreground grayscale opacity-60 hover:opacity-85"
              )}
              href={item?.href ?? action}
              key={learner.id}
            >
              <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                {learner.avatarUrl ? (
                  <img alt={`${learner.nickname}头像`} className="size-full object-cover" src={learner.avatarUrl} />
                ) : (
                  item?.avatarFallback
                )}
              </span>
              <span className="min-w-0">
                <span className="block max-w-24 truncate text-sm font-semibold">{learner.nickname}</span>
                <span className="mt-0.5 block text-xs">{learner.gradeLabel}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function learnerAccountPickerItems(
  action: string,
  learners: ProfileSelectionLearner[],
  selectedLearnerId: string
) {
  return learners.map((learner) => {
    const selected = learner.id === selectedLearnerId;
    const params = new URLSearchParams({ learnerId: learner.id });

    return {
      href: `${action}?${params.toString()}`,
      selected,
      dimmed: !selected,
      avatarFallback: Array.from(learner.nickname.trim())[0] ?? "学"
    };
  });
}

export function NoLearnerAccounts() {
  return (
    <div className="rounded-2xl border border-dashed border-border px-5 py-12 text-center text-sm text-muted-foreground">
      请先在“账号管理”中添加学习账号
    </div>
  );
}

export function LearnerDataPlaceholder({ learner }: { learner: ProfileSelectionLearner }) {
  return (
    <section className="flex min-h-64 flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border bg-background px-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-xl bg-secondary">
        <BarChart3 className="size-6" />
      </span>
      <div>
        <h3 className="text-base font-semibold">{learner.nickname}的学习数据</h3>
        <p className="mt-2 text-sm text-muted-foreground">学习数据看板将在后续版本开放</p>
      </div>
    </section>
  );
}
