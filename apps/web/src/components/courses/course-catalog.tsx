"use client";

import { LockKeyhole } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { publicCourseItemPresentation } from "@/lib/course-editor-state";
import { courseCatalogLanguages, courseCatalogTitle } from "@/lib/course-catalog-languages";
import { pictureBookLanguageName, pictureBookOriginalLabel } from "@/lib/picture-book-languages";
import type { PublicCourse } from "@/lib/course-types";
import { CourseMaterialLaunch } from "./course-material-launch";

export function CourseCatalog({ course, canOpenMaterials }: { course: PublicCourse; canOpenMaterials: boolean }) {
  const [language, setLanguage] = useState("original");
  const items = [...course.items].sort((a, b) => a.sortOrder - b.sortOrder);
  const languages = courseCatalogLanguages(items);
  const firstBookId = items[0]?.launchHref?.match(/^\/picture-books\/([^/]+)\/play/)?.[1] ?? "";
  return <section className="overflow-hidden">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
      <div className="flex items-center gap-3"><h2 className="text-xl font-semibold leading-snug">专辑目录</h2>
        {languages.length ? <select aria-label="目录语言" className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm" value={language} onChange={event => setLanguage(event.target.value)}>
          <option value="original">{pictureBookOriginalLabel(firstBookId)}</option>{languages.map(code => <option key={code} value={code}>{pictureBookLanguageName(code)}</option>)}
        </select> : null}
      </div>
      <span className="text-sm text-muted-foreground">共 {items.length} 个课件</span>
    </header>
    <ol>{items.map((item, index) => {
      const presentation = publicCourseItemPresentation(course, item), title = courseCatalogTitle(item, language);
      return <li className="grid grid-cols-[2rem_minmax(0,1fr)_2rem] items-start gap-3 border-b border-border px-5 py-4 transition-colors last:border-b-0 hover:bg-secondary/45 sm:px-6" key={item.id}>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-sm font-semibold">{index + 1}</span>
        <div className="min-w-0 flex-1"><p className="break-words text-sm font-medium leading-8">{title}</p></div>
        {presentation.href ? <CourseMaterialLaunch canOpenDirectly={canOpenMaterials} courseId={course.id} href={presentation.href} itemName={title} language={language} /> : <Button aria-label={`${title}：${presentation.statusLabel}`} className="size-8 px-0" disabled size="sm" title={presentation.statusLabel} variant="outline"><LockKeyhole className="size-4" /></Button>}
      </li>;
    })}</ol>
  </section>;
}
