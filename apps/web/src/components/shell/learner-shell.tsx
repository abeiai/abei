import Link from "next/link";
import type { ReactNode } from "react";

import { LearnerLearningProvider } from "@/components/learning/learner-learning-provider";
import { ProfileSwitcher } from "@/components/profiles/profile-switcher";
import { Button } from "@/components/ui/button";
import {
  returnToAccountAction,
  switchLearnerAction,
  type LearnerHome,
  type ProfileSelection
} from "@/lib/profile-api";

export const learnerNavigationItems = [
  { href: "/learn", label: "学习首页" },
  { href: "/tools", label: "场景应用" },
  { href: "/learn#courses", label: "我的课程" }
] as const;

export const learnerHeaderActions = [
  { href: "/learn/center", label: "学习中心" }
] as const;

export function LearnerShell({
  children,
  home,
  selection
}: {
  children: ReactNode;
  home: LearnerHome;
  selection: ProfileSelection;
}) {
  return (
    <LearnerLearningProvider enabled={process.env.LEARNER_LEARNING_ENABLED === "1"}>
      <main className="min-h-screen bg-[#f6f6f5] text-foreground">
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-[4.5rem] w-full max-w-7xl items-center justify-between gap-4 px-5">
          <Link className="flex items-center gap-3 font-display text-xl font-semibold" href="/learn">
            <span className="xueleai-brand-mark">学</span>
            <span>学乐 AI</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground sm:flex">
            {learnerNavigationItems.map((item) => (
              <Link className="hover:text-foreground" href={item.href} key={item.href}>
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href={learnerHeaderActions[0].href}>{learnerHeaderActions[0].label}</Link>
            </Button>
            <ProfileSwitcher
              currentLearner={home.learner}
              learners={selection.learners}
              returnToAccountAction={returnToAccountAction}
              switchLearnerAction={switchLearnerAction}
            />
          </div>
        </div>
        <nav className="flex items-center justify-around border-t border-border px-3 py-2 text-sm font-medium sm:hidden">
          {learnerNavigationItems.map((item) => (
            <Link className="rounded-lg px-3 py-2 hover:bg-secondary" href={item.href} key={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      {children}
      </main>
    </LearnerLearningProvider>
  );
}
