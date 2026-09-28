import type { Metadata } from "next";

import { VideoGuideLearningPlayer } from "@/components/experience/video-guide-learning-player";
import { PublicShell } from "@/components/shell/public-shell";
import { getPublicVideoGuideLesson } from "@/lib/video-guide-api";
import { parseVideoGuideLessonContent } from "@/lib/video-guide-data";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    courseId?: string;
    courseRevisionItemId?: string;
  }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;

  return {
    title: `视频导学学习页 - ${id}`,
    description: "可分享的视频导学学习页面，包含自主视听、互动讲解、词语巩固、随堂练习和跟读训练。"
  };
}

export default async function MediaTutorLessonPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { courseId, courseRevisionItemId } = await searchParams;
  const lesson = await getPublicVideoGuideLesson(id).catch(() => null);

  return (
    <PublicShell showFooter={false}>
      <VideoGuideLearningPlayer
        courseId={courseId}
        courseRevisionItemId={courseRevisionItemId}
        initialContent={lesson ? parseVideoGuideLessonContent(lesson.content) : null}
        initialLesson={
          lesson
            ? {
                id: lesson.shareToken,
                shareToken: lesson.shareToken,
                title: lesson.title,
                mediaName: lesson.mediaName,
                mediaType: lesson.mediaType,
                mediaMimeType: lesson.mediaMimeType,
                mediaUrl: lesson.mediaUrl,
                subtitleName: lesson.subtitleName ?? "同步字幕文件.srt",
                subtitleUrl: lesson.subtitleUrl,
                createdAt: lesson.createdAt
              }
            : null
        }
        learningMaterialId={lesson?.id ?? id}
        lessonId={id}
      />
    </PublicShell>
  );
}
