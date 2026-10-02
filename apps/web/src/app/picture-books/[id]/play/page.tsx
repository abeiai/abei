import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PictureBookPlayer } from "@/components/picture-books/picture-book-player";
import { getOptionalCurrentUser } from "@/lib/auth-actions";
import { getWebProfile } from "@/lib/profile-api";
import { LearnerLearningProvider } from "@/components/learning/learner-learning-provider";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "绘本播放 - 阿贝 AI" };

export default async function PictureBookPlayPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ courseId?: string; courseRevisionItemId?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const returnPath = `/picture-books/${encodeURIComponent(id)}/play`;
  if (!(await getOptionalCurrentUser())) redirect(`/login?next=${encodeURIComponent(returnPath)}`);
  const profile = await getWebProfile(returnPath);
  const learnerMode = profile.mode === "LEARNER" && Boolean(query.courseId && query.courseRevisionItemId);
  return <LearnerLearningProvider enabled={process.env.LEARNER_LEARNING_ENABLED === "1" && learnerMode}>
    <PictureBookPlayer bookId={id} courseId={query.courseId} courseRevisionItemId={query.courseRevisionItemId} learnerMode={learnerMode} />
  </LearnerLearningProvider>;
}
