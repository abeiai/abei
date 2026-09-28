import Link from "next/link";
import { notFound } from "next/navigation";

import { CourseEditor } from "@/components/courses/course-editor";
import { DashboardShell } from "@/components/shell/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth-actions";
import { getCourseMaterialOptions, getUserCourse } from "@/lib/course-api";
import { requireAccountProfile } from "@/lib/profile-api";

export const dynamic = "force-dynamic";

function isMissingCourse(error: unknown) {
  return error instanceof Error && error.message === "课程不存在";
}

export default async function EditCoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const continuation = `/dashboard/courses/${encodeURIComponent(id)}`;
  await requireAccountProfile(continuation);
  const user = await getCurrentUser();
  const [courseResult, materialOptionsResult] = await Promise.allSettled([
    getUserCourse(id),
    getCourseMaterialOptions()
  ]);

  if (courseResult.status === "rejected") {
    if (isMissingCourse(courseResult.reason)) {
      notFound();
    }

    return (
      <DashboardShell active="courses" continuation={continuation}>
        <section className="flex w-full flex-col gap-6 px-5 py-8">
          <Card>
            <CardContent className="flex flex-col items-start gap-4 py-8">
              <p className="text-sm text-destructive" role="alert">课程加载失败，请稍后重试。</p>
              <Button asChild variant="outline">
                <Link href={`/dashboard/courses/${id}`}>重新加载</Link>
              </Button>
            </CardContent>
          </Card>
        </section>
      </DashboardShell>
    );
  }

  const course = courseResult.value;

  if (course.userId !== user.id) {
    notFound();
  }

  const materialOptions = materialOptionsResult.status === "fulfilled"
    ? materialOptionsResult.value
    : null;

  return (
    <DashboardShell active="courses" continuation={continuation}>
      <section className="flex w-full flex-col gap-6 px-5 py-8">
        <div>
          <h2 className="text-2xl font-semibold tracking-normal">编辑课程</h2>
          <p className="mt-1 text-sm text-muted-foreground">保存内容后可申请发布。</p>
        </div>
        {materialOptions === null ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive" role="alert">
            课件库加载失败，现有课程内容仍可查看。
          </div>
        ) : null}
        <CourseEditor course={course} materialOptions={materialOptions ?? []} />
      </section>
    </DashboardShell>
  );
}
