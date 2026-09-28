"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  createLearnerAction,
  updateLearnerAction
} from "@/lib/profile-actions";
import type {
  LearnerGradeOption,
  ProfileActionState,
  ProfileSelectionLearner
} from "@/lib/profile-api";

const initialState: ProfileActionState = {};

export interface LearnerFormModel {
  canCreate: boolean;
  passwordSetupHref?: string;
  requiresSwitchPassword: boolean;
}

export function learnerFormModel({
  hasLoginPassword,
  learnerCount
}: {
  hasLoginPassword: boolean;
  learnerCount: number;
}): LearnerFormModel {
  const requiresSwitchPassword = learnerCount === 0;
  return {
    canCreate: !requiresSwitchPassword || hasLoginPassword,
    ...(requiresSwitchPassword && !hasLoginPassword
      ? { passwordSetupHref: "/forgot-password?next=/dashboard/learners" }
      : {}),
    requiresSwitchPassword
  };
}

export function validateLearnerInput(
  input: { nickname: string; grade: string; switchPassword?: string },
  grades: readonly LearnerGradeOption[],
  model: LearnerFormModel
) {
  const nickname = input.nickname.trim();

  if (!nickname) {
    return { error: "请输入学习账号昵称" };
  }
  if (Array.from(nickname).length > 30) {
    return { error: "昵称不能超过 30 个字符" };
  }
  if (!grades.some((grade) => grade.value === input.grade)) {
    return { error: "请选择正确的学段" };
  }
  if (model.requiresSwitchPassword && !/^\d{6}$/u.test(input.switchPassword ?? "")) {
    return { error: "切换密码必须为 6 位数字" };
  }

  return {
    data: {
      nickname,
      grade: input.grade,
      ...(model.requiresSwitchPassword ? { switchPassword: input.switchPassword } : {})
    }
  };
}

export function LearnerForm({
  grades,
  hasLoginPassword,
  learner,
  learnerCount
}: {
  grades: LearnerGradeOption[];
  hasLoginPassword: boolean;
  learner?: ProfileSelectionLearner;
  learnerCount: number;
}) {
  const model = learnerFormModel({ hasLoginPassword, learnerCount });
  const action = learner ? updateLearnerAction : createLearnerAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const nicknameId = `learner-nickname-${learner?.id ?? "new"}`;
  const gradeId = `learner-grade-${learner?.id ?? "new"}`;

  return (
    <form action={formAction} className="space-y-5 rounded-2xl border border-border bg-background p-5 shadow-sm">
      {learner ? <input name="learnerId" type="hidden" value={learner.id} /> : null}
      {!learner ? <input name="canCreate" type="hidden" value={String(model.canCreate)} /> : null}
      {!learner ? (
        <input
          name="requiresSwitchPassword"
          type="hidden"
          value={String(model.requiresSwitchPassword)}
        />
      ) : null}
      <FieldGroup className="grid gap-4 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={nicknameId}>昵称</FieldLabel>
          <Input
            defaultValue={learner?.nickname}
            id={nicknameId}
            maxLength={30}
            name="nickname"
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={gradeId}>学段年级</FieldLabel>
          <Select defaultValue={learner?.grade ?? ""} id={gradeId} name="grade" required>
            <option disabled value="">请选择学段</option>
            {grades.map((grade) => (
              <option key={grade.value} value={grade.value}>{grade.label}</option>
            ))}
          </Select>
        </Field>
      </FieldGroup>

      {!learner && model.requiresSwitchPassword && model.canCreate ? (
        <Field>
          <FieldLabel htmlFor="learner-switch-password">切换密码</FieldLabel>
          <Input
            autoComplete="new-password"
            id="learner-switch-password"
            inputMode="numeric"
            maxLength={6}
            minLength={6}
            name="switchPassword"
            pattern="[0-9]{6}"
            required
            type="password"
          />
        </Field>
      ) : null}

      {state.error || state.success ? (
        <p aria-live="polite" className={state.error ? "text-sm text-destructive" : "text-sm text-foreground"}>
          {state.error ?? state.success}
        </p>
      ) : null}

      {!learner && !model.canCreate ? (
        <Button asChild size="sm" variant="outline">
          <Link href={model.passwordSetupHref ?? "/forgot-password"}>先设置主账号登录密码</Link>
        </Button>
      ) : (
        <Button disabled={pending} size="sm" type="submit">
          {pending ? "保存中…" : learner ? "保存资料" : "添加学习账号"}
        </Button>
      )}
    </form>
  );
}
