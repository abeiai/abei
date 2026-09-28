import type { Metadata } from "next";

import { EnglishGuidedStudyLearningPlayer } from "@/components/experience/english-guided-study-learning-player";
import { PublicShell } from "@/components/shell/public-shell";
import { getPublicEnglishGuidedStudyMaterial } from "@/lib/english-guided-study-public-api";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    courseId?: string;
    courseRevisionItemId?: string;
  }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const material = await getPublicEnglishGuidedStudyMaterial(id).catch(() => null);

  return {
    title: material ? `学古诗文 - ${material.title}` : `古诗文学习页 - ${id}`,
    description: "可分享的古诗文带学页面，包含背景讲解、逐句理解、诵读和背诵巩固。"
  };
}

export default async function GushiwenStudyPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { courseId, courseRevisionItemId } = await searchParams;
  const material = await getPublicEnglishGuidedStudyMaterial(id).catch(() => null);
  const gushiwenMaterial = material?.scene === "GUSHIWEN" ? material : null;

  return (
    <PublicShell showFooter={false}>
      <EnglishGuidedStudyLearningPlayer
        courseId={courseId}
        courseRevisionItemId={courseRevisionItemId}
        material={gushiwenMaterial}
        materialId={gushiwenMaterial?.id ?? id}
        scene="GUSHIWEN"
      />
    </PublicShell>
  );
}
