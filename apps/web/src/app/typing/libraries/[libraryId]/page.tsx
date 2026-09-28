import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { PublicShell } from "@/components/shell/public-shell";
import { TypingLibraryStart } from "@/components/typing/typing-library-start";
import { getOptionalCurrentUser } from "@/lib/auth-actions";
import { typingVolumeLabel } from "@/lib/typing-api";
import { getTypingLibrary } from "@/lib/typing-server-api";
import { typingLibraryGradeLabel, typingLibraryVersionLabel } from "@/lib/typing-stage";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "词库 - 打字记词 - 学乐 AI"
};

export default async function TypingLibraryPage({
  params
}: {
  params: Promise<{ libraryId: string }>;
}) {
  const { libraryId } = await params;
  const [library, currentUser] = await Promise.all([
    getTypingLibrary(libraryId),
    getOptionalCurrentUser()
  ]);

  return (
    <PublicShell currentUser={currentUser}>
      <main className="min-h-[calc(100vh-4.5rem)] bg-[#f6f8fb] px-5 py-10">
        <div className="mx-auto w-full max-w-6xl">
          <Link className="inline-flex items-center gap-2 text-sm font-semibold text-[#6f7f95] hover:text-[#25344d]" href="/typing">
            <ArrowLeft className="size-4" /> 返回词库
          </Link>
          <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_420px]">
            <div>
              <section className="overflow-hidden rounded-3xl border border-[#dfe5ed] bg-white shadow-sm">
                <div className="p-6 sm:p-8">
                  <div className="self-center">
                    <div className="flex flex-wrap gap-2 text-xs font-semibold text-[#5f79a5]">
                      <span className="rounded-full bg-[#edf4ff] px-3 py-1.5">{typingLibraryVersionLabel(library)}</span>
                      <span className="rounded-full bg-[#f4effc] px-3 py-1.5">{typingLibraryGradeLabel(library)}</span>
                      <span className="rounded-full bg-[#f8f2e7] px-3 py-1.5">{typingVolumeLabel(library.volume)}</span>
                    </div>
                    <h1 className="mt-4 text-3xl font-semibold tracking-tight text-[#25344d]">{library.title}</h1>
                    <p className="mt-3 text-sm leading-6 text-[#748297]">本册共{library.unitCount}个单元，{library.itemCount}个单词</p>
                  </div>
                </div>
              </section>

              <section className="mt-6 rounded-3xl border border-[#dfe5ed] bg-white p-7">
                <h2 className="text-lg font-semibold text-[#25344d]">单元列表</h2>
                <div className="mt-4 divide-y divide-[#edf0f4]">
                  {library.units.map((unit, index) => (
                    <div className="flex items-center gap-4 py-4" key={unit.id}>
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#f0f4f9] text-sm font-semibold text-[#64758d]">{index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-[#34445d]">{unit.title}</div>
                        <div className="mt-1 text-xs text-[#8996a8]">{unit.itemCount}个单词</div>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${unit.mediaStatus === "READY" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                        {unit.mediaStatus === "READY" ? "媒体就绪" : "可练习"}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
            <TypingLibraryStart isLoggedIn={Boolean(currentUser)} library={library} />
          </div>
        </div>
      </main>
    </PublicShell>
  );
}
