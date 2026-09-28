"use client";

import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  publishLearningContext,
  publishLearningEvent
} from "@/components/learning/learner-learning-provider";
import {
  createFlashcardRound,
  recordFlashcardGrade,
  type FlashcardRoundState
} from "@/lib/flashcard-learning-tracking";
import {
  getPublicLearningFlashcardDeck,
  reviewLearningFlashcard,
  type LearningFlashcardDeck,
  type LearningFlashcardReviewGrade
} from "@/lib/learning-flashcards-api";

export function PublicFlashcardPlayer({
  courseId,
  courseRevisionItemId,
  deckId,
  learnerMode
}: {
  courseId?: string;
  courseRevisionItemId?: string;
  deckId: string;
  learnerMode: boolean;
}) {
  const [deck, setDeck] = useState<LearningFlashcardDeck | null>(null);
  const [index, setIndex] = useState(0);
  const [answerVisible, setAnswerVisible] = useState(false);
  const [error, setError] = useState("");
  const [feedbackError, setFeedbackError] = useState("");
  const [grading, setGrading] = useState(false);
  const [round, setRound] = useState<FlashcardRoundState>(() => createFlashcardRound([]));

  useEffect(() => {
    let cancelled = false;

    getPublicLearningFlashcardDeck(deckId)
      .then((result) => {
        if (!cancelled) {
          setDeck(result);
          setRound(createFlashcardRound(result.cards.map((card) => card.id)));
          setError("");
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "闪卡组暂不可用");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [deckId]);

  useEffect(() => {
    if (!deck || !learnerMode) return;
    const context = {
      isLearning: true,
      ...(courseId ? { courseId } : {}),
      ...(courseRevisionItemId ? { courseRevisionItemId } : {}),
      materialType: "LEARNING_FLASHCARD" as const,
      materialId: deck.id,
      partKey: "FLASHCARD_ROUND"
    };
    const timer = window.setTimeout(() => {
      publishLearningContext(context);
      publishLearningEvent({ type: "MATERIAL_STARTED", partKey: "FLASHCARD_ROUND" });
    });
    return () => {
      window.clearTimeout(timer);
      publishLearningContext({ isLearning: false });
    };
  }, [courseId, courseRevisionItemId, deck, learnerMode]);

  if (error) {
    return <PlayerState title={error} />;
  }

  if (!deck) {
    return <PlayerState title="正在加载闪卡" />;
  }

  if (deck.cards.length === 0) {
    return <PlayerState title="这个闪卡组还没有可学习的卡片" />;
  }

  const card = deck.cards[index]!;

  function move(delta: -1 | 1) {
    setIndex((current) => (current + delta + deck!.cards.length) % deck!.cards.length);
    setAnswerVisible(false);
  }

  async function gradeCard(grade: LearningFlashcardReviewGrade) {
    if (!learnerMode || !answerVisible || grading) return;
    setGrading(true);
    setFeedbackError("");
    try {
      const review = await reviewLearningFlashcard(card.id, grade);
      publishLearningEvent({
        type: "FLASHCARD_REVIEWED",
        partKey: "FLASHCARD_ROUND",
        reviewId: review.id
      });
      const nextRound = recordFlashcardGrade(round, card.id, grade);
      setRound(nextRound);
      if (!nextRound.completed) move(1);
    } catch (reason) {
      setFeedbackError(reason instanceof Error ? reason.message : "复习反馈暂未保存，请重试");
    } finally {
      setGrading(false);
    }
  }

  function restartRound() {
    setRound(createFlashcardRound(deck!.cards.map((item) => item.id)));
    setIndex(0);
    setAnswerVisible(false);
    setFeedbackError("");
  }

  if (round.completed && learnerMode) {
    return (
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-4xl items-center px-5 py-8">
        <section className="w-full rounded-2xl border border-border bg-background p-8 text-center shadow-sm">
          <h1 className="text-2xl font-semibold tracking-normal">本轮学习完成</h1>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <RoundMetric label="模糊" value={round.counts.blurry} />
            <RoundMetric label="需加强" value={round.counts.hard} />
            <RoundMetric label="已掌握" value={round.counts.mastered} />
          </div>
          <Button className="mt-7" onClick={restartRound} type="button">
            <RotateCcw />再学一轮
          </Button>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-4xl flex-col px-5 py-8 md:py-12">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">{deck.title}</h1>
          {deck.summary ? <p className="mt-2 text-sm text-muted-foreground">{deck.summary}</p> : null}
        </div>
        <Badge variant="outline">{index + 1} / {deck.cards.length}</Badge>
      </div>

      <button
        aria-label={answerVisible ? "隐藏答案" : "显示答案"}
        className="flex min-h-80 flex-1 cursor-pointer flex-col items-center justify-center rounded-2xl border border-border bg-background p-8 text-center shadow-sm"
        onClick={() => setAnswerVisible((current) => !current)}
        type="button"
      >
        <Badge variant="muted">{card.type}</Badge>
        <p className="mt-7 text-2xl font-semibold leading-10">{card.front}</p>
        {answerVisible ? (
          <div className="mt-8 w-full border-t border-border pt-8">
            <p className="text-lg leading-8 text-foreground">{card.back}</p>
          </div>
        ) : (
          <p className="mt-8 text-sm text-muted-foreground">点击卡片查看答案</p>
        )}
      </button>

      {learnerMode && answerVisible ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Button disabled={grading} onClick={() => void gradeCard("BLURRY")} type="button" variant="outline">
            模糊
          </Button>
          <Button disabled={grading} onClick={() => void gradeCard("HARD")} type="button" variant="outline">
            需加强
          </Button>
          <Button disabled={grading} onClick={() => void gradeCard("MASTERED")} type="button">
            已掌握
          </Button>
        </div>
      ) : null}

      {feedbackError ? <p className="mt-3 text-center text-sm text-destructive">{feedbackError}</p> : null}

      <div className="mt-6 flex items-center justify-between gap-3">
        <Button onClick={() => move(-1)} type="button" variant="outline">
          <ChevronLeft />上一张
        </Button>
        <Button onClick={() => setAnswerVisible((current) => !current)} type="button" variant="outline">
          <RotateCcw />{answerVisible ? "隐藏答案" : "显示答案"}
        </Button>
        <Button onClick={() => move(1)} type="button">
          下一张<ChevronRight />
        </Button>
      </div>
    </main>
  );
}

function RoundMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-secondary p-4">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

function PlayerState({ title }: { title: string }) {
  return (
    <main className="flex min-h-[60vh] items-center justify-center px-5 text-center">
      <p className="text-base text-muted-foreground">{title}</p>
    </main>
  );
}
