"use client";

import { useActionState, useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { selectProfileAction } from "@/lib/profile-actions";
import type { ProfileActionState, ProfileSelection } from "@/lib/profile-api";

const initialState: ProfileActionState = {};

export interface ProfileSelectionCard {
  mode: "ACCOUNT" | "LEARNER";
  learnerId: string | null;
  label: string;
  nickname: string;
  avatarUrl: string | null;
  avatarFallback: string;
  gradeLabel: string | null;
  accountId: string;
}

export function profileSelectionCards(selection: ProfileSelection): ProfileSelectionCard[] {
  const account: ProfileSelectionCard = {
    mode: "ACCOUNT",
    learnerId: null,
    label: selection.account.label,
    nickname: selection.account.nickname,
    avatarUrl: selection.account.avatarUrl,
    avatarFallback: nicknameInitial(selection.account.nickname),
    gradeLabel: null,
    accountId: selection.account.accountId
  };
  const learners = selection.learners
    .filter((learner) => learner.status === "ACTIVE")
    .map<ProfileSelectionCard>((learner) => ({
      mode: "LEARNER",
      learnerId: learner.id,
      label: learner.nickname,
      nickname: learner.nickname,
      avatarUrl: learner.avatarUrl,
      avatarFallback: nicknameInitial(learner.nickname),
      gradeLabel: learner.gradeLabel,
      accountId: learner.accountId
    }));

  return [account, ...learners];
}

export function ProfileSelector({ selection, next, autoSelectAccount = false }: {
  selection: ProfileSelection;
  next?: string;
  autoSelectAccount?: boolean;
}) {
  const [state, formAction, isPending] = useActionState(selectProfileAction, initialState);
  const accountForm = useRef<HTMLFormElement>(null);
  const autoSubmitted = useRef(false);

  useEffect(() => {
    if (!autoSelectAccount || autoSubmitted.current || !accountForm.current) return;
    autoSubmitted.current = true;
    // Submit through the browser so the Server Action can write session cookies.
    accountForm.current.requestSubmit();
  }, [autoSelectAccount]);

  const cards = profileSelectionCards(selection);
  const learnerCards = cards.slice(1);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((card) => (
          <Card key={`${card.mode}:${card.learnerId ?? selection.account.id}`} className="rounded-2xl shadow-sm">
            <CardContent className="flex items-center gap-4 pt-5 md:pt-6">
              <ProfileAvatar card={card} />
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold">{card.label}</p>
                {card.mode === "ACCOUNT" ? (
                  <>
                    <p className="truncate text-sm text-muted-foreground">{card.nickname}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">主账号 ID：{card.accountId}</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">{card.gradeLabel}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">子账号 ID：{card.accountId}</p>
                  </>
                )}
              </div>
              <form action={formAction} ref={card.mode === "ACCOUNT" ? accountForm : undefined}>
                <input name="target" type="hidden" value={card.mode} />
                {card.learnerId ? <input name="learnerId" type="hidden" value={card.learnerId} /> : null}
                {next ? <input name="next" type="hidden" value={next} /> : null}
                <Button disabled={isPending} size="sm" type="submit">
                  选择
                </Button>
              </form>
            </CardContent>
          </Card>
        ))}
      </div>

      {learnerCards.length === 0 ? (
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-dashed border-border p-5">
          <p className="text-sm font-medium">还没有学习账号</p>
          <form action={formAction}>
            <input name="target" type="hidden" value="ACCOUNT" />
            <input name="next" type="hidden" value="/dashboard/learners" />
            <Button disabled={isPending} size="sm" type="submit" variant="outline">
              使用我的账号添加
            </Button>
          </form>
        </div>
      ) : null}

      {state.error ? <p className="text-sm text-destructive" role="alert">{state.error}</p> : null}
    </div>
  );
}

function ProfileAvatar({ card }: { card: ProfileSelectionCard }) {
  return (
    <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-base font-semibold">
      {card.avatarUrl ? (
        <img alt={`${card.nickname}头像`} className="size-full object-cover" src={card.avatarUrl} />
      ) : (
        <span aria-hidden="true">{card.avatarFallback}</span>
      )}
    </div>
  );
}

function nicknameInitial(nickname: string) {
  return Array.from(nickname.trim())[0] ?? "?";
}
