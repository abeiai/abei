import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CalendarClock, CheckCircle2, Clock3, RotateCcw } from "lucide-react";

import { PublicShell } from "@/components/shell/public-shell";
import {
  ResetTypingReviewButton,
  StartTypingReviewButton
} from "@/components/typing/typing-review-actions";
import { getOptionalCurrentUser } from "@/lib/auth-actions";
import { guardLearnerScenarioEntry } from "@/lib/profile-api";
import { getTypingReviews, getTypingReviewSummary } from "@/lib/typing-server-api";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "记忆复习 - 打字记词 - 学乐 AI" };

export default async function TypingReviewPage() {
  const user = await getOptionalCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent("/typing/review")}`);
  await guardLearnerScenarioEntry("/typing/review");
  const [summary, reviews] = await Promise.all([
    getTypingReviewSummary(),
    getTypingReviews("page=1&pageSize=50")
  ]);

  return (
    <PublicShell currentUser={user}>
      <main className="min-h-[calc(100vh-4.5rem)] bg-[#f6f8fb] px-5 py-10">
        <div className="mx-auto w-full max-w-6xl">
          <Link className="inline-flex items-center gap-2 text-sm font-semibold text-[#6f7f95] hover:text-[#25344d]" href="/typing">
            <ArrowLeft className="size-4" /> 返回打字记词
          </Link>
          <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold text-[#25344d]">记忆复习</h1>
              <p className="mt-2 text-sm text-[#77869a]">按记忆阶段安排需要再次拼写的单词。</p>
            </div>
            <StartTypingReviewButton disabled={summary.dueToday === 0} />
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-4">
            <SummaryCard icon={<RotateCcw />} label="今日到期" tone="blue" value={summary.dueToday} />
            <SummaryCard icon={<CalendarClock />} label="明日到期" tone="amber" value={summary.dueTomorrow} />
            <SummaryCard icon={<CheckCircle2 />} label="已掌握" tone="green" value={summary.mastered} />
            <SummaryCard icon={<Clock3 />} label="记忆中" tone="slate" value={summary.total - summary.mastered} />
          </div>

          <section className="mt-8 overflow-hidden rounded-3xl border border-[#dfe5ed] bg-white shadow-sm">
            <div className="border-b border-[#e9edf2] px-6 py-5">
              <h2 className="text-lg font-semibold text-[#34445d]">记忆列表</h2>
            </div>
            <div className="divide-y divide-[#edf0f4]">
              {reviews.items.map((review) => (
                <article className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center" key={review.id}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <strong className="text-xl text-[#34445d]">{review.item.text}</strong>
                      {review.item.britishPhonetic ? <span className="text-sm font-semibold text-[#9aa7b9]">{review.item.britishPhonetic}</span> : null}
                      <span className={stateClass(review.state)}>阶段 {review.stage}</span>
                    </div>
                    <p className="mt-1 text-sm text-[#6f7e92]">{review.item.translation}</p>
                    <p className="mt-2 text-xs text-[#9aa5b4]">{review.item.unit.library.title} · {review.item.unit.title}</p>
                  </div>
                  <div className="flex items-center gap-5 text-xs text-[#7d899a]">
                    <span>正确 {review.totalCorrect}/{review.totalAttempts}</span>
                    <span>{dueLabel(review.dueAt)}</span>
                    <ResetTypingReviewButton itemId={review.item.id} />
                  </div>
                </article>
              ))}
              {reviews.items.length === 0 ? (
                <div className="px-6 py-16 text-center text-sm text-[#8491a3]">完成练习后，记忆项目会显示在这里。</div>
              ) : null}
            </div>
          </section>
        </div>
      </main>
    </PublicShell>
  );
}

function SummaryCard({ icon, label, tone, value }: { icon: React.ReactNode; label: string; tone: string; value: number }) {
  const toneClass = ({
    blue: "bg-blue-50 text-blue-600",
    amber: "bg-amber-50 text-amber-600",
    green: "bg-emerald-50 text-emerald-600",
    slate: "bg-slate-100 text-slate-600"
  } as Record<string, string>)[tone];
  return (
    <div className="rounded-2xl border border-[#e1e7ef] bg-white p-5">
      <span className={`flex size-9 items-center justify-center rounded-xl [&_svg]:size-4 ${toneClass}`}>{icon}</span>
      <strong className="mt-4 block text-3xl text-[#34445d]">{value}</strong>
      <span className="mt-1 block text-xs text-[#8390a2]">{label}</span>
    </div>
  );
}

function stateClass(state: string) {
  return `rounded-full px-2.5 py-1 text-xs font-semibold ${state === "MASTERED" ? "bg-emerald-50 text-emerald-700" : state === "RELEARNING" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"}`;
}

function dueLabel(value: string | null) {
  if (!value) return "待安排";
  const due = new Date(value);
  return due <= new Date() ? "现在到期" : `${due.getMonth() + 1}月${due.getDate()}日复习`;
}
