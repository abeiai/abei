import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, CheckCircle2, Clock3, History } from "lucide-react";

import { PublicShell } from "@/components/shell/public-shell";
import { getOptionalCurrentUser } from "@/lib/auth-actions";
import { guardLearnerScenarioEntry } from "@/lib/profile-api";
import { getTypingHistory } from "@/lib/typing-server-api";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "练习记录 - 打字记词 - 学乐 AI" };

export default async function TypingHistoryPage() {
  const user = await getOptionalCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent("/typing/history")}`);
  await guardLearnerScenarioEntry("/typing/history");
  const history = await getTypingHistory();

  return (
    <PublicShell currentUser={user}>
      <main className="min-h-[calc(100vh-4.5rem)] bg-[#f6f8fb] px-5 py-10">
        <div className="mx-auto w-full max-w-5xl">
          <Link className="inline-flex items-center gap-2 text-sm font-semibold text-[#6f7f95] hover:text-[#25344d]" href="/typing">
            <ArrowLeft className="size-4" /> 返回打字记词
          </Link>
          <h1 className="mt-6 text-3xl font-semibold text-[#25344d]">练习记录</h1>
          <p className="mt-2 text-sm text-[#77869a]">查看每一轮练习的完成情况。</p>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <Metric icon={<History />} label="练习轮次" value={history.summary.sessionCount} />
            <Metric icon={<CheckCircle2 />} label="作答次数" value={history.summary.attemptCount} />
            <Metric icon={<Clock3 />} label="累计作答" value={`${Math.round(history.summary.durationMs / 60000)} 分钟`} />
          </div>

          <section className="mt-8 overflow-hidden rounded-3xl border border-[#dfe5ed] bg-white">
            <div className="divide-y divide-[#edf0f4]">
              {history.sessions.map((session) => (
                <article className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center" key={session.id}>
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#eef4fd] text-[#4b7dcc]"><CalendarDays className="size-5" /></span>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-sm font-semibold text-[#34445d]">{session.library.title}</h2>
                    <p className="mt-1 text-xs text-[#8995a6]">{session.unit?.title ?? "综合练习"} · {formatDate(session.startedAt)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-xs text-[#758399]">
                    <span className={statusClass(session.status)}>{statusLabel(session.status)}</span>
                    <span>答对 {session.correctCount}</span>
                    <span>错词 {session.wrongCount}</span>
                    <span>提示 {session.hintedCount}</span>
                  </div>
                </article>
              ))}
              {history.sessions.length === 0 ? <div className="px-6 py-16 text-center text-sm text-[#8491a3]">还没有练习记录</div> : null}
            </div>
          </section>
        </div>
      </main>
    </PublicShell>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return <div className="rounded-2xl border border-[#e1e7ef] bg-white p-5"><span className="text-[#6689be] [&_svg]:size-5">{icon}</span><strong className="mt-4 block text-2xl text-[#34445d]">{value}</strong><span className="mt-1 block text-xs text-[#8390a2]">{label}</span></div>;
}

function statusClass(status: string) {
  return `rounded-full px-2.5 py-1 font-semibold ${status === "COMPLETED" ? "bg-emerald-50 text-emerald-700" : status === "ABANDONED" ? "bg-slate-100 text-slate-600" : "bg-blue-50 text-blue-700"}`;
}

function statusLabel(status: string) {
  return ({ COMPLETED: "已完成", ABANDONED: "已结束", ACTIVE: "进行中", PAUSED: "已暂停", EXPIRED: "已过期" } as Record<string, string>)[status] ?? status;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
