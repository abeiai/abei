"use client";

import { useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { LogOut, Repeat2, ShieldCheck, UserRound, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { learnerLogoutAction } from "@/lib/auth-actions";
import type { ProfileActionState, ProfileSelectionLearner } from "@/lib/profile-api";

export type ProfileTransitionAction = (
  previousState: ProfileActionState,
  formData: FormData
) => Promise<ProfileActionState>;

export function profileSwitcherTargets(
  learners: readonly ProfileSelectionLearner[],
  currentLearnerId: string | null
) {
  return learners.filter(
    (learner) => learner.status === "ACTIVE" && learner.id !== currentLearnerId
  );
}

export function ProfileSwitcher({
  currentLearner,
  learners,
  returnToAccountAction,
  switchLearnerAction
}: {
  currentLearner: {
    id: string;
    nickname: string;
    avatarUrl: string | null;
  };
  learners: readonly ProfileSelectionLearner[];
  returnToAccountAction: ProfileTransitionAction;
  switchLearnerAction: ProfileTransitionAction;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<"ACCOUNT" | "LEARNER" | "LOGOUT" | null>(null);
  const targets = profileSwitcherTargets(learners, currentLearner.id);

  function closeDialog() {
    setDialog(null);
    setMenuOpen(false);
  }

  return (
    <div className="relative">
      <button
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-full border border-border bg-background px-2 py-1.5 text-sm font-medium shadow-sm hover:bg-secondary"
        onClick={() => setMenuOpen((open) => !open)}
        type="button"
      >
        <ProfileAvatar learner={currentLearner} />
        <span className="hidden max-w-28 truncate sm:inline">{currentLearner.nickname}</span>
      </button>

      {menuOpen ? (
        <div className="absolute right-0 top-12 z-40 w-56 rounded-xl border border-border bg-background p-2 text-sm shadow-xl" role="menu">
          {targets.length ? (
            <button
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-secondary"
              onClick={() => setDialog("LEARNER")}
              role="menuitem"
              type="button"
            >
              <Repeat2 className="size-4" />
              切换学习账号
            </button>
          ) : null}
          <button
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-secondary"
            onClick={() => setDialog("ACCOUNT")}
            role="menuitem"
            type="button"
          >
            <UserRound className="size-4" />
            返回我的账号
          </button>
          <button
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-secondary"
            onClick={() => setDialog("LOGOUT")}
            role="menuitem"
            type="button"
          >
            <LogOut className="size-4" />
            退出登录
          </button>
        </div>
      ) : null}

      {dialog === "LEARNER" ? (
        <SwitchLearnerDialog action={switchLearnerAction} onClose={closeDialog} targets={targets} />
      ) : null}
      {dialog === "ACCOUNT" ? (
        <ReturnAccountDialog action={returnToAccountAction} onClose={closeDialog} />
      ) : null}
      {dialog === "LOGOUT" ? (
        <LogoutLearnerDialog action={learnerLogoutAction} onClose={closeDialog} />
      ) : null}
    </div>
  );
}

export function AccountLearnerSwitcher({
  enterLearnerAction,
  learners
}: {
  enterLearnerAction: ProfileTransitionAction;
  learners: readonly ProfileSelectionLearner[];
}) {
  const [open, setOpen] = useState(false);
  const targets = profileSwitcherTargets(learners, null);

  if (!targets.length) {
    return null;
  }

  return (
    <>
      <button
        className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-left transition-colors hover:bg-secondary"
        onClick={() => setOpen(true)}
        role="menuitem"
        type="button"
      >
        <Repeat2 className="size-4" />
        切换学习账号
      </button>
      {open ? (
        <EnterLearnerDialog
          action={enterLearnerAction}
          onClose={() => setOpen(false)}
          targets={targets}
        />
      ) : null}
    </>
  );
}

function EnterLearnerDialog({
  action,
  onClose,
  targets
}: {
  action: ProfileTransitionAction;
  onClose: () => void;
  targets: readonly ProfileSelectionLearner[];
}) {
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setError("");
    startTransition(async () => {
      const result = await action({}, formData);
      setError(result.error ?? "");
    });
  }

  return (
    <SwitcherDialog onClose={onClose} title="选择学习账号">
      <form action={submit} className="grid gap-4">
        <LearnerSelect targets={targets} />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogActions disabled={isPending} onClose={onClose} submitLabel={isPending ? "进入中" : "进入学习"} />
      </form>
    </SwitcherDialog>
  );
}

function SwitchLearnerDialog({
  action,
  onClose,
  targets
}: {
  action: ProfileTransitionAction;
  onClose: () => void;
  targets: readonly ProfileSelectionLearner[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setError("");
    startTransition(async () => {
      const result = await action({}, formData);
      formRef.current?.reset();
      setError(result.error ?? "");
    });
  }

  function close() {
    formRef.current?.reset();
    setError("");
    onClose();
  }

  return (
    <SwitcherDialog onClose={close} title="切换学习账号">
      <form action={submit} className="grid gap-4" ref={formRef}>
        <LearnerSelect targets={targets} />
        <label className="grid gap-2 text-sm font-semibold">
          切换密码
          <Input
            autoComplete="off"
            inputMode="numeric"
            maxLength={6}
            minLength={6}
            name="switchPassword"
            pattern="[0-9]{6}"
            placeholder="请输入 6 位切换密码"
            type="password"
            required
          />
        </label>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogActions disabled={isPending} onClose={close} submitLabel={isPending ? "切换中" : "确认切换"} />
      </form>
    </SwitcherDialog>
  );
}

function ReturnAccountDialog({
  action,
  onClose
}: {
  action: ProfileTransitionAction;
  onClose: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setError("");
    startTransition(async () => {
      const result = await action({}, formData);
      formRef.current?.reset();
      setError(result.error ?? "");
    });
  }

  function close() {
    formRef.current?.reset();
    setError("");
    onClose();
  }

  return (
    <SwitcherDialog onClose={close} title="返回我的账号">
      <form action={submit} className="grid gap-4" ref={formRef}>
        <label className="grid gap-2 text-sm font-semibold">
          主账号登录密码
          <Input
            autoComplete="current-password"
            name="password"
            placeholder="请输入主账号登录密码"
            type="password"
            required
          />
        </label>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogActions disabled={isPending} onClose={close} submitLabel={isPending ? "验证中" : "确认返回"} />
      </form>
    </SwitcherDialog>
  );
}

function LogoutLearnerDialog({
  action,
  onClose
}: {
  action: ProfileTransitionAction;
  onClose: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setError("");
    startTransition(async () => {
      const result = await action({}, formData);
      formRef.current?.reset();
      setError(result.error ?? "");
    });
  }

  function close() {
    formRef.current?.reset();
    setError("");
    onClose();
  }

  return (
    <SwitcherDialog onClose={close} title="退出登录">
      <form action={submit} className="grid gap-4" ref={formRef}>
        <label className="grid gap-2 text-sm font-semibold">
          切换密码
          <Input
            autoComplete="off"
            inputMode="numeric"
            maxLength={6}
            minLength={6}
            name="switchPassword"
            pattern="[0-9]{6}"
            placeholder="请输入 6 位切换密码"
            type="password"
            required
          />
        </label>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogActions
          disabled={isPending}
          onClose={close}
          submitLabel={isPending ? "验证中" : "确认退出"}
        />
      </form>
    </SwitcherDialog>
  );
}

function LearnerSelect({ targets }: { targets: readonly ProfileSelectionLearner[] }) {
  return (
    <label className="grid gap-2 text-sm font-semibold">
      学习账号
      <Select defaultValue={targets[0]?.id} name="learnerId" required>
        {targets.map((learner) => (
          <option key={learner.id} value={learner.id}>
            {learner.nickname} · {learner.gradeLabel}
          </option>
        ))}
      </Select>
    </label>
  );
}

function SwitcherDialog({
  children,
  onClose,
  title
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
}) {
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4 py-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-background p-5 shadow-2xl">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" />
            <h2 className="text-base font-semibold">{title}</h2>
          </div>
          <button aria-label="关闭" className="rounded-full p-2 hover:bg-secondary" onClick={onClose} type="button">
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

function DialogActions({
  disabled,
  onClose,
  submitLabel
}: {
  disabled: boolean;
  onClose: () => void;
  submitLabel: string;
}) {
  return (
    <div className="flex justify-end gap-3 pt-2">
      <Button disabled={disabled} onClick={onClose} type="button" variant="outline">
        取消
      </Button>
      <Button disabled={disabled} type="submit">
        {submitLabel}
      </Button>
    </div>
  );
}

function ProfileAvatar({ learner }: { learner: { nickname: string; avatarUrl: string | null } }) {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-xs font-semibold text-primary-foreground">
      {learner.avatarUrl ? (
        <img alt={`${learner.nickname}头像`} className="size-full object-cover" src={learner.avatarUrl} />
      ) : (
        Array.from(learner.nickname.trim())[0] ?? "学"
      )}
    </span>
  );
}
