import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, CheckCircle2, RotateCcw } from "lucide-react";

import { PublicShell } from "@/components/shell/public-shell";
import { getOptionalCurrentUser } from "@/lib/auth-actions";
import { getTypingLibraries, getTypingReviewSummary } from "@/lib/typing-server-api";
import {
  typingLibraryGradeLabel,
  typingLibraryStageLabel,
  typingLibraryVersionLabel
} from "@/lib/typing-stage";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "打字记词 - 学乐 AI",
  description: "听读音、看中文与图片输入英文，并按记忆阶段复习错词。"
};

export default async function TypingPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const queryString = new URLSearchParams(
    Object.entries(query).flatMap(([key, value]) => typeof value === "string" ? [[key, value]] : [])
  ).toString();
  const [currentUser, libraries] = await Promise.all([
    getOptionalCurrentUser(),
    getTypingLibraries(queryString)
  ]);
  const review = currentUser ? await getTypingReviewSummary().catch(() => null) : null;

  return (
    <PublicShell currentUser={currentUser}>
      <div className="min-h-[calc(100vh-4.5rem)] bg-[#f6f8fb]">
        <section className="border-b border-[#e5eaf1] bg-white">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-8 lg:flex-row lg:items-end lg:justify-between lg:py-10">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-2 rounded-full bg-[#edf5ff] px-3 py-1.5 text-sm font-semibold text-[#3978dd]">
                <BookOpen className="size-4" /> 打字记词
              </span>
              <h1 className="mt-4 text-2xl font-semibold tracking-normal text-[#25344d] sm:text-3xl">
                视听读写全方位记忆巩固单词
              </h1>
              <p className="mt-4 max-w-xl text-base leading-7 text-[#738197]">
                基于官方教材和考纲词库，结合看图片、听语音进行单词跟读和输入；错词会按记忆阶段自动回到复习队列。
              </p>
            </div>
            <div className="grid w-full shrink-0 grid-cols-3 lg:w-80 gap-3">
              <Stat label="待复习" value={review?.dueToday ?? 0} icon={<RotateCcw />} />
              <Stat label="已掌握" value={review?.mastered ?? 0} icon={<CheckCircle2 />} />
              <Stat label="词库" value={libraries.items.length} icon={<BookOpen />} />
            </div>
          </div>
        </section>

        <main className="mx-auto w-full max-w-7xl px-5 py-10">
          <form className="grid gap-3 rounded-2xl border border-[#e0e6ee] bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-6">
            <input
              className="h-11 rounded-xl border border-[#dce3ec] px-4 text-sm outline-none focus:border-[#4d86e8] lg:col-span-2"
              defaultValue={typeof query.q === "string" ? query.q : ""}
              name="q"
              placeholder="搜索词库"
            />
            <FilterSelect label="全部学段" name="stage" options={libraries.filters.stages} selected={query.stage} />
            <FilterSelect label="全部版本" name="version" options={libraries.filters.versions} selected={query.version} />
            <FilterSelect label="全部年级" name="grade" options={libraries.filters.grades} selected={query.grade} />
            <button className="h-11 rounded-xl bg-[#25344d] px-5 text-sm font-semibold text-white hover:bg-[#1b2739]" type="submit">
              筛选词库
            </button>
          </form>

          <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {libraries.items.map((library) => (
              <Link
                className="group rounded-2xl border border-[#dfe5ed] bg-white transition hover:border-[#b8c9e2] hover:shadow-sm"
                href={`/typing/libraries/${library.id}`}
                key={library.id}
              >
                <div className="p-6">
                  <div className="flex flex-wrap gap-2 text-xs font-semibold text-[#5c75a0]">
                    <span className="rounded-full bg-[#eef4fd] px-2.5 py-1">{typingLibraryVersionLabel(library)}</span>
                    <span className="rounded-full bg-[#f4f1fb] px-2.5 py-1">{typingLibraryGradeLabel(library)}</span>
                    <span className="rounded-full bg-[#f7f3e9] px-2.5 py-1">{volumeLabel(library.volume)}</span>
                  </div>
                  <h2 className="mt-4 text-xl font-semibold text-[#25344d]">{library.title}</h2>
                  <p className="mt-2 text-sm text-[#7b889b]">本册共{library.unitCount}个单元，{library.itemCount}个单词</p>
                  <div className="mt-6 flex items-center justify-between text-sm font-semibold text-[#3978dd]">
                    进入词库
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {libraries.items.length === 0 ? (
            <div className="mt-8 rounded-3xl border border-dashed border-[#ccd6e4] bg-white px-6 py-16 text-center text-[#748297]">
              没有找到符合条件的词库
            </div>
          ) : null}
        </main>
      </div>
    </PublicShell>
  );
}

function Stat({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#e2e8f0] bg-[#fafbfd] p-4">
      <span className="block text-[#7d92b0] [&_svg]:size-4">{icon}</span>
      <strong className="mt-3 block text-2xl font-semibold text-[#25344d]">{value}</strong>
      <span className="mt-1 block text-xs text-[#8190a5]">{label}</span>
    </div>
  );
}

function FilterSelect({
  label,
  name,
  options,
  selected
}: {
  label: string;
  name: string;
  options: string[];
  selected: string | string[] | undefined;
}) {
  return (
    <select className="h-11 rounded-xl border border-[#dce3ec] bg-white px-3 text-sm text-[#56657b] outline-none focus:border-[#4d86e8]" defaultValue={typeof selected === "string" ? selected : ""} name={name}>
      <option value="">{label}</option>
      {options.map((option) => <option key={option} value={option}>{typingLibraryStageLabel(option)}</option>)}
    </select>
  );
}

function volumeLabel(volume: string | null) {
  return ({ FIRST_VOLUME: "上册", SECOND_VOLUME: "下册", FULL_VOLUME: "全一册" } as Record<string, string>)[volume ?? ""] ?? "全册";
}
