import type { Metadata } from "next";

import { PublicFlashcardPlayer } from "@/components/courses/public-flashcard-player";
import { PublicShell } from "@/components/shell/public-shell";
import { getWebProfile } from "@/lib/profile-api";

export const metadata: Metadata = {
  title: "闪卡学习 - 学乐 AI",
  description: "在线学习专辑闪卡。"
};

export default async function PublicFlashcardPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    courseId?: string;
    courseRevisionItemId?: string;
  }>;
}) {
  const { id } = await params;
  const { courseId, courseRevisionItemId } = await searchParams;
  const profile = await getWebProfile(`/learn/flashcards/${encodeURIComponent(id)}`);

  return (
    <PublicShell showFooter={false}>
      <PublicFlashcardPlayer
        courseId={courseId}
        courseRevisionItemId={courseRevisionItemId}
        deckId={id}
        learnerMode={profile.mode === "LEARNER"}
      />
    </PublicShell>
  );
}
