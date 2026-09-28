import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LearningFlashcardStudyPage, LearningFlashcardsConsole } from "@/components/experience/learning-flashcards-console";
import { LearnerLearningProvider } from "@/components/learning/learner-learning-provider";
import { PublicShell } from "@/components/shell/public-shell";
import { getWebProfile, guardLearnerScenarioEntry } from "@/lib/profile-api";
import {
  createToolCreatorId,
  creatorIdFromSegments,
  flashcardCreatorPath
} from "@/lib/tool-creator-routes";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{
    segments?: string[];
  }>;
  searchParams: Promise<{
    courseId?: string;
    courseRevisionItemId?: string;
  }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const segments = (await params).segments;
  const creatorId = creatorIdFromSegments(segments);
  const deckId = creatorId ? "" : extractFlashcardDeckId(segments);

  return {
    title: creatorId ? "制作学习闪卡 - 学乐 AI" : deckId ? "闪卡学习 - 学乐 AI" : "AI 学习闪卡 - 学乐 AI",
    description: deckId ? "沉浸式学习 AI 闪卡。" : "选择电子教材、上传材料或导入卡组，生成可复习的 AI 学习闪卡。"
  };
}

export default async function FlashcardPage({ params, searchParams }: PageProps) {
  const segments = (await params).segments;
  const { courseId, courseRevisionItemId } = await searchParams;
  const creatorId = creatorIdFromSegments(segments);

  if (!segments?.length || (segments[0] === "creator" && !creatorId)) {
    await guardLearnerScenarioEntry("/flashcard");
    redirect(flashcardCreatorPath(createToolCreatorId()));
  }

  if (creatorId) {
    await guardLearnerScenarioEntry(`/flashcard/creator/${encodeURIComponent(creatorId)}`);
    return (
      <PublicShell showFooter={false}>
        <LearningFlashcardsConsole creatorId={creatorId} />
      </PublicShell>
    );
  }

  const deckId = extractFlashcardDeckId(segments);

  if (deckId) {
    const profile = await getWebProfile(`/flashcard/${encodeURIComponent(deckId)}`);
    return (
      <LearnerLearningProvider
        enabled={process.env.LEARNER_LEARNING_ENABLED === "1" && profile.mode === "LEARNER"}
      >
        <LearningFlashcardStudyPage
          courseId={courseId}
          courseRevisionItemId={courseRevisionItemId}
          deckId={deckId}
        />
      </LearnerLearningProvider>
    );
  }

  redirect(flashcardCreatorPath(createToolCreatorId()));
}

function extractFlashcardDeckId(segments?: string[]) {
  return segments?.map((segment) => segment.trim()).filter(Boolean).at(-1) ?? "";
}
