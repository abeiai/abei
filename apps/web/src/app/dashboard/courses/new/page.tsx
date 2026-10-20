import Link from "next/link";

import { CourseEditor } from "@/components/courses/course-editor";
import { DashboardShell } from "@/components/shell/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth-actions";
import { getCourseMaterialOptions } from "@/lib/course-api";
import { requireAccountProfile } from "@/lib/profile-api";

export const dynamic = "force-dynamic";

export default async function NewCoursePage() {
  await requireAccountProfile("/dashboard/courses/new");
  const [userResult, materialOptionsResult] = await Promise.allSettled([
    getCurrentUser(),
    getCourseMaterialOptions()
  ]);

  if (userResult.status === "rejected") {
    throw userResult.reason;
  }

  const materialOptions = materialOptionsResult.status === "fulfilled"
    ? materialOptionsResult.value
    : null;

  return (
    <DashboardShell active="courses" continuation="/dashboard/courses/new">
      <section className="flex w-full flex-col gap-6 px-5 py-8">
        <div>
          <h2 className="text-2xl font-semibold tracking-normal">创建专辑</h2>
          <p className="mt-1 text-sm text-muted-foreground">整理专辑信息并添加已完成的课件。</p>
        </div>
        {materialOptions ? (
          <CourseEditor materialOptions={materialOptions} />
        ) : (
          <Card>
            <CardContent className="flex flex-col items-start gap-4 py-8">
              <p className="text-sm text-destructive" role="alert">课件库加载失败，请稍后重试。</p>
              <Button asChild variant="outline">
                <Link href="/dashboard/courses/new">重新加载</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </section>
    </DashboardShell>
  );
}
