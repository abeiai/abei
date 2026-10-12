import { Clock3 } from "lucide-react";

import { TextbookBreadcrumbs } from "@/components/textbook/textbook-page-sections";

export function CourseReviewingState({ courseId }: { courseId: string }) {
  return (
    <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-10 sm:px-8 lg:px-10">
      <TextbookBreadcrumbs
        items={[
          { href: "/", label: "首页" },
          { href: "/library", label: "绘本馆" },
          { href: `/c/${courseId}`, label: "资源审核中" }
        ]}
      />

      <div
        className="flex min-h-80 flex-col items-center justify-center rounded-2xl border border-border bg-[#f7f7f6] px-6 py-16 text-center"
        role="status"
      >
        <span className="flex size-12 items-center justify-center rounded-full bg-background text-muted-foreground shadow-sm">
          <Clock3 aria-hidden="true" className="size-6" />
        </span>
        <h1 className="mt-5 font-display text-3xl font-semibold tracking-normal">资源审核中</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          该资源正在审核，审核完成后即可访问。
        </p>
      </div>
    </section>
  );
}
