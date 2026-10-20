import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CourseReviewingState } from "@/components/courses/course-reviewing-state";
import { PublicCourseDetail } from "@/components/courses/public-course-detail";
import { PublicShell } from "@/components/shell/public-shell";
import { getOptionalCurrentUser } from "@/lib/auth-actions";
import { getCoursePageOrNull } from "@/lib/course-api";
import {
  buildPublicCourseMetadata,
  buildReviewingCourseMetadata
} from "@/lib/public-course-metadata";
import { resolvePublicSiteUrl } from "@/lib/seo-metadata";
import { getPublicSystemConfigs } from "@/lib/settings-api";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

const courseIdPattern = /^[0-9a-f]{24}$/;

async function loadCoursePage(id: string) {
  if (!courseIdPattern.test(id)) {
    notFound();
  }

  const coursePage = await getCoursePageOrNull(id);

  if (!coursePage) {
    notFound();
  }

  return coursePage;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const [coursePage, settings] = await Promise.all([
    loadCoursePage(id),
    getPublicSystemConfigs().catch(() => [])
  ]);
  const configByKey = new Map(settings.map((setting) => [setting.key, setting.value]));
  const siteUrl = resolvePublicSiteUrl(configByKey.get("siteUrl"));

  const metadata = coursePage.state === "AVAILABLE"
    ? buildPublicCourseMetadata(coursePage.course, siteUrl)
    : buildReviewingCourseMetadata(coursePage.courseId, siteUrl);
  return { ...metadata, openGraph: { ...metadata.openGraph, siteName: configByKey.get("siteName")?.trim() || "阿贝智能" } };
}

export default async function PublicCoursePage({ params }: PageProps) {
  const { id } = await params;
  const coursePage = await loadCoursePage(id);
  const currentUser = await getOptionalCurrentUser();

  return (
    <PublicShell currentUser={currentUser}>
      {coursePage.state === "REVIEWING"
        ? <CourseReviewingState courseId={coursePage.courseId} />
        : (
            <PublicCourseDetail
              canOpenMaterials={Boolean(currentUser) || coursePage.previewMode !== "PUBLIC"}
              course={coursePage.course}
              hasPublishedRevision={coursePage.hasPublishedRevision}
              previewMode={coursePage.previewMode}
              revisionStatus={coursePage.revisionStatus}
            />
          )}
    </PublicShell>
  );
}
