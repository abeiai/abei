"use client";

import { BarChart3, Camera, Pencil, Plus, RotateCcw, UserRoundX } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";

import { LearnerForm } from "@/components/profiles/learner-form";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  deactivateLearnerAction,
  restoreLearnerAction,
  updateSwitchPasswordAction,
  uploadLearnerAvatarAction
} from "@/lib/profile-actions";
import type {
  LearnerGradeOption,
  ProfileActionState,
  ProfileSelectionAccount,
  ProfileSelectionLearner
} from "@/lib/profile-api";

const initialState: ProfileActionState = {};

export const deactivationConfirmationText =
  "停用后将无法选择该学习账号，已有学习记录仍会保留。";

export function learnerListModel(learners: ProfileSelectionLearner[]) {
  return {
    active: learners
      .filter((learner) => learner.status === "ACTIVE")
      .map((learner) => ({ ...learner, action: "deactivate" as const })),
    inactive: learners
      .filter((learner) => learner.status === "INACTIVE")
      .map((learner) => ({ ...learner, action: "restore" as const }))
  };
}

export function LearnerManager({
  account,
  grades,
  learners
}: {
  account: ProfileSelectionAccount;
  grades: LearnerGradeOption[];
  learners: ProfileSelectionLearner[];
}) {
  const lists = learnerListModel(learners);
  const [view, setView] = useState<"active" | "inactive">("active");
  const [showAdd, setShowAdd] = useState(learners.length === 0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const visibleLearners = lists[view];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-5 py-8 md:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-normal">账号管理</h2>
          <p className="mt-1 text-sm text-muted-foreground">添加和编辑学习账号基本信息</p>
        </div>
        <Button onClick={() => setShowAdd((current) => !current)} type="button">
          <Plus />
          添加学习账号
        </Button>
      </header>

      {showAdd ? (
        <section aria-labelledby="add-learner-title" className="space-y-3">
          <h3 className="text-base font-semibold" id="add-learner-title">添加学习账号</h3>
          <LearnerForm
            grades={grades}
            hasLoginPassword={account.hasLoginPassword}
            learnerCount={learners.length}
          />
        </section>
      ) : null}

      <section aria-labelledby="learner-list-title" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold" id="learner-list-title">学习账号</h3>
          <div aria-label="学习账号状态" className="flex rounded-full border border-border p-1" role="group">
            <button
              aria-pressed={view === "active"}
              className="rounded-full px-4 py-1.5 text-sm font-medium outline-none aria-pressed:bg-foreground aria-pressed:text-background focus-visible:ring-[3px] focus-visible:ring-ring/35"
              onClick={() => setView("active")}
              type="button"
            >
              使用中（{lists.active.length}）
            </button>
            <button
              aria-pressed={view === "inactive"}
              className="rounded-full px-4 py-1.5 text-sm font-medium outline-none aria-pressed:bg-foreground aria-pressed:text-background focus-visible:ring-[3px] focus-visible:ring-ring/35"
              onClick={() => setView("inactive")}
              type="button"
            >
              已停用（{lists.inactive.length}）
            </button>
          </div>
        </div>

        {visibleLearners.length ? (
          <div className="space-y-4">
            {visibleLearners.map((learner) => (
              <LearnerRow
                editing={editingId === learner.id}
                grades={grades}
                key={learner.id}
                learner={learner}
                learnerCount={learners.length}
                onToggleEdit={() => setEditingId((current) => current === learner.id ? null : learner.id)}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground">
            {view === "active" ? "暂无使用中的学习账号" : "暂无已停用的学习账号"}
          </div>
        )}
      </section>

      {learners.length > 0 && account.hasLoginPassword ? <SwitchPasswordForm /> : null}
    </div>
  );
}

function LearnerRow({
  editing,
  grades,
  learner,
  learnerCount,
  onToggleEdit
}: {
  editing: boolean;
  grades: LearnerGradeOption[];
  learner: ProfileSelectionLearner;
  learnerCount: number;
  onToggleEdit: () => void;
}) {
  const statusAction = learner.status === "ACTIVE" ? deactivateLearnerAction : restoreLearnerAction;
  const [statusState, formAction, pending] = useActionState(statusAction, initialState);

  function confirmDeactivate(event: React.FormEvent<HTMLFormElement>) {
    if (learner.status === "ACTIVE" && !window.confirm(deactivationConfirmationText)) {
      event.preventDefault();
    }
  }

  return (
    <article className="rounded-2xl border border-border bg-background p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-lg font-semibold">
          {learner.avatarUrl ? (
            <img alt={`${learner.nickname}的头像`} className="size-full object-cover" src={learner.avatarUrl} />
          ) : (
            learner.nickname.slice(0, 1)
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="truncate text-base font-semibold">{learner.nickname}</h4>
          <p className="text-sm text-muted-foreground">{learner.gradeLabel}</p>
          <p className="text-xs text-muted-foreground">子账号 ID：{learner.accountId}</p>
        </div>
        <Button onClick={onToggleEdit} size="sm" type="button" variant="outline">
          <Pencil />
          {editing ? "收起" : "编辑"}
        </Button>
        {learner.status === "ACTIVE" ? (
          <Button asChild size="sm" variant="outline">
            <Link href={`/dashboard/learners/learning?learnerId=${encodeURIComponent(learner.id)}`}>
              <BarChart3 />
              学习情况
            </Link>
          </Button>
        ) : null}
        <form action={formAction} onSubmit={confirmDeactivate}>
          <input name="learnerId" type="hidden" value={learner.id} />
          <Button disabled={pending} size="sm" type="submit" variant="outline">
            {learner.status === "ACTIVE" ? <UserRoundX /> : <RotateCcw />}
            {pending ? "处理中…" : learner.status === "ACTIVE" ? "停用" : "恢复"}
          </Button>
        </form>
      </div>
      {statusState.error || statusState.success ? (
        <p aria-live="polite" className={statusState.error ? "mt-3 text-sm text-destructive" : "mt-3 text-sm"}>
          {statusState.error ?? statusState.success}
        </p>
      ) : null}

      {editing ? (
        <div className="mt-5 space-y-4 border-t border-border pt-5">
          <LearnerForm
            grades={grades}
            hasLoginPassword
            learner={learner}
            learnerCount={learnerCount}
          />
          <LearnerAvatarForm learnerId={learner.id} />
        </div>
      ) : null}
    </article>
  );
}

function LearnerAvatarForm({ learnerId }: { learnerId: string }) {
  const [state, formAction, pending] = useActionState(uploadLearnerAvatarAction, initialState);
  const inputId = `learner-avatar-${learnerId}`;

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3 rounded-xl border border-border p-4">
      <input name="learnerId" type="hidden" value={learnerId} />
      <Field className="min-w-52 flex-1">
        <FieldLabel htmlFor={inputId}>头像</FieldLabel>
        <Input accept="image/*" id={inputId} name="file" required type="file" />
      </Field>
      <Button disabled={pending} size="sm" type="submit" variant="outline">
        <Camera />
        {pending ? "上传中…" : "更新头像"}
      </Button>
      {state.error || state.success ? (
        <p aria-live="polite" className={state.error ? "w-full text-sm text-destructive" : "w-full text-sm"}>
          {state.error ?? state.success}
        </p>
      ) : null}
    </form>
  );
}

function SwitchPasswordForm() {
  const [state, formAction, pending] = useActionState(updateSwitchPasswordAction, initialState);

  return (
    <section aria-labelledby="switch-password-title" className="rounded-2xl border border-border bg-background p-5 shadow-sm">
      <h3 className="text-base font-semibold" id="switch-password-title">学习账号切换密码</h3>
      <form action={formAction} className="mt-4 grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <Field>
          <FieldLabel htmlFor="account-password">主账号登录密码</FieldLabel>
          <Input autoComplete="current-password" id="account-password" name="currentPassword" required type="password" />
        </Field>
        <Field>
          <FieldLabel htmlFor="new-switch-password">新切换密码</FieldLabel>
          <Input
            autoComplete="new-password"
            id="new-switch-password"
            inputMode="numeric"
            maxLength={6}
            minLength={6}
            name="switchPassword"
            pattern="[0-9]{6}"
            required
            type="password"
          />
        </Field>
        <Button disabled={pending} type="submit">{pending ? "保存中…" : "更新密码"}</Button>
        {state.error || state.success ? (
          <p aria-live="polite" className={state.error ? "text-sm text-destructive md:col-span-3" : "text-sm md:col-span-3"}>
            {state.error ?? state.success}
          </p>
        ) : null}
      </form>
    </section>
  );
}
