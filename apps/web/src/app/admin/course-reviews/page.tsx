import {
  ResourceReviewLoadError,
  ResourceReviewManager
} from "@/components/admin/resource-review-manager";
import { AdminShell } from "@/components/shell/admin-shell";
import { getAdminCourseReviews } from "@/lib/course-api";
import { normalizeCourseReviewFilters } from "@/lib/course-review-presentation";
import type { CourseReviewRequest } from "@/lib/course-types";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminCourseReviewsPage({ searchParams }: PageProps) {
  const filters = normalizeCourseReviewFilters(await searchParams ?? {});
  let reviews: CourseReviewRequest[] = [];
  let loadFailed = false;

  try {
    reviews = await getAdminCourseReviews({
      status: filters.status,
      scope: filters.scope || undefined
    });
  } catch {
    loadFailed = true;
  }

  return (
    <AdminShell active="/admin/course-reviews" title="资源审核">
      {loadFailed ? (
        <ResourceReviewLoadError />
      ) : (
        <ResourceReviewManager filters={filters} reviews={reviews} />
      )}
    </AdminShell>
  );
}
