import type { Metadata } from "next";

import { EnglishGuidedStudyLearningPlayer } from "@/components/experience/english-guided-study-learning-player";
import { PublicShell } from "@/components/shell/public-shell";
import { getPublicEnglishGuidedStudyMaterial } from "@/lib/english-guided-study-public-api";

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
  const loadedMaterial = await getPublicEnglishGuidedStudyMaterial(id).catch(() => null);
  const material = loadedMaterial?.scene === "GUSHIWEN" ? null : loadedMaterial;

  return {
    title: material ? `英文带学 - ${material.title}` : `英文带学学习页 - ${id}`,
    description: "可分享的英文带学学习页面，包含讲解音频、逐句高亮和练习巩固。"
  };
}

export default async function Text2LessonStudyPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { courseId, courseRevisionItemId } = await searchParams;
  const loadedMaterial = await getPublicEnglishGuidedStudyMaterial(id).catch(() => null);
  const material = loadedMaterial?.scene === "GUSHIWEN" ? null : loadedMaterial;

  return (
    <PublicShell showFooter={false}>
      <EnglishGuidedStudyLearningPlayer
        courseId={courseId}
        courseRevisionItemId={courseRevisionItemId}
        material={material}
        materialId={material?.id ?? id}
      />
    </PublicShell>
  );
}
