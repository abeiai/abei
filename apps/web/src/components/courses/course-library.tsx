"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { BookOpen, Check, Loader2, Plus, Search, X } from "lucide-react";

import { PublicCourseCard } from "@/components/courses/public-course-card";
import { Button } from "@/components/ui/button";
import { ResponsiveImage } from "@/components/ui/responsive-image";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  addCoursesAction,
  loadEnrolledCoursesAction,
  searchCourseCatalogAction
} from "@/lib/course-api";
import { toggleCourseSelection } from "@/lib/course-library";
import type { CourseCatalogPage, CourseListItem } from "@/lib/course-types";
import { cn } from "@/lib/utils";

const emptyCatalog: CourseCatalogPage = {
  items: [],
  page: 1,
  pageSize: 20,
  total: 0,
  tags: []
};

export function CourseLibrary({
  initialCourses,
  initialTotal,
  loadFailed = false
}: {
  initialCourses: CourseListItem[];
  initialTotal: number;
  loadFailed?: boolean;
}) {
  const [courses, setCourses] = useState(initialCourses);
  const [total, setTotal] = useState(initialTotal);
  const [loadedPage, setLoadedPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreFeedback, setLoadMoreFeedback] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const returnFocusRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setCourses(initialCourses);
    setTotal(initialTotal);
    setLoadedPage(1);
    setLoadMoreFeedback("");
  }, [initialCourses, initialTotal]);

  function openPicker(event: ReactMouseEvent<HTMLButtonElement>) {
    returnFocusRef.current = event.currentTarget;
    setPickerOpen(true);
  }

  const closePicker = useCallback(() => {
    setPickerOpen(false);
    window.requestAnimationFrame(() => returnFocusRef.current?.focus());
  }, []);

  async function loadMoreCourses() {
    if (loadingMore || courses.length >= total) return;

    setLoadingMore(true);
    setLoadMoreFeedback("");
    const result = await loadEnrolledCoursesAction(loadedPage + 1, 12);

    if (!result.ok) {
      setLoadMoreFeedback(result.message);
      setLoadingMore(false);
      return;
    }

    setCourses((current) => {
      const merged = new Map(current.map((course) => [course.id, course]));
      result.data.items.forEach((course) => merged.set(course.id, course));
      return Array.from(merged.values());
    });
    setTotal(result.data.total);
    setLoadedPage(result.data.page);
    setLoadingMore(false);
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold">已加入专辑</h3>
          <p className="mt-1 text-sm text-muted-foreground">{total} 个专辑</p>
        </div>
        <Button onClick={openPicker} type="button">
          <Plus />
          添加专辑
        </Button>
      </div>

      {loadFailed ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive" role="alert">
          已加入专辑加载失败，请稍后刷新重试。
        </div>
      ) : courses.length > 0 ? (
        <>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {courses.map((course) => <PublicCourseCard course={course} key={course.id} />)}
          </div>
          {courses.length < total ? (
            <div className="flex justify-center">
              <Button disabled={loadingMore} onClick={() => void loadMoreCourses()} type="button" variant="outline">
                {loadingMore ? <Loader2 className="animate-spin" /> : null}
                加载更多
              </Button>
            </div>
          ) : null}
          {loadMoreFeedback ? (
            <p className="text-center text-sm text-destructive" role="alert">{loadMoreFeedback}</p>
          ) : null}
        </>
      ) : (
        <div className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card px-6 text-center">
          <BookOpen className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">还没有加入专辑</p>
          <Button onClick={openPicker} type="button" variant="outline">
            <Plus />
            添加专辑
          </Button>
        </div>
      )}

      {pickerOpen ? <CoursePickerDialog onClose={closePicker} /> : null}
    </section>
  );
}

function CoursePickerDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const requestIdRef = useRef(0);
  const tagsLoadedRef = useRef(false);
  const [portalReady, setPortalReady] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [tag, setTag] = useState("");
  const [page, setPage] = useState(1);
  const [catalog, setCatalog] = useState<CourseCatalogPage>(emptyCatalog);
  const [catalogTags, setCatalogTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const pageCount = Math.max(1, Math.ceil(catalog.total / catalog.pageSize));

  useEffect(() => {
    setPortalReady(true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    if (portalReady) searchInputRef.current?.focus();
  }, [portalReady]);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setFeedback("");
    const timeout = window.setTimeout(async () => {
      const includeTags = !tagsLoadedRef.current;
      const result = await searchCourseCatalogAction({
        keyword,
        tag,
        page,
        pageSize: 20,
        includeTags
      });

      if (requestId !== requestIdRef.current) return;

      if (result.ok) {
        if (includeTags) {
          setCatalogTags(result.data.tags);
          tagsLoadedRef.current = true;
        }
        setCatalog(result.data);
      } else {
        setFeedback(result.message);
      }
      setLoading(false);
    }, keyword ? 250 : 0);

    return () => window.clearTimeout(timeout);
  }, [keyword, page, tag]);

  function handleDialogKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && !submitting) {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key !== "Tab") return;

    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      )
    ).filter((element) => element.offsetParent !== null);

    if (focusable.length === 0) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  async function addSelectedCourses() {
    if (selectedIds.length === 0 || submitting) return;
    setSubmitting(true);
    setFeedback("");
    const result = await addCoursesAction(selectedIds);

    if (!result.ok) {
      setFeedback(result.message);
      setSubmitting(false);
      return;
    }

    router.refresh();
    onClose();
  }

  if (!portalReady) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      onClick={() => !submitting && onClose()}
      role="presentation"
    >
      <div
        aria-labelledby="course-picker-title"
        aria-modal="true"
        className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xl"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleDialogKeyDown}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-xl font-semibold" id="course-picker-title">添加专辑</h2>
            <p className="mt-1 text-sm text-muted-foreground">可选择 {catalog.total} 个专辑</p>
          </div>
          <Button
            aria-label="关闭添加专辑"
            className="size-10 px-0"
            disabled={submitting}
            onClick={onClose}
            type="button"
            variant="ghost"
          >
            <X className="size-5" />
          </Button>
        </header>

        <div className="grid shrink-0 gap-3 border-b border-border px-5 py-4 sm:grid-cols-[minmax(0,1fr)_180px] sm:px-6">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              onChange={(event) => {
                setKeyword(event.target.value);
                setPage(1);
              }}
              placeholder="搜索专辑名称、简介、标签或作者"
              ref={searchInputRef}
              value={keyword}
            />
          </div>
          <Select
            aria-label="按标签筛选"
            onChange={(event) => {
              setTag(event.target.value);
              setPage(1);
            }}
            value={tag}
          >
            <option value="">全部标签</option>
            {catalogTags.map((item) => <option key={item} value={item}>{item}</option>)}
          </Select>
        </div>

        <div aria-busy={loading} className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {loading ? (
            <div className="flex min-h-56 items-center justify-center" role="status">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
              <span className="sr-only">正在加载专辑</span>
            </div>
          ) : feedback ? (
            <div className="flex min-h-56 items-center justify-center text-sm text-destructive" role="alert">
              {feedback}
            </div>
          ) : catalog.items.length > 0 ? (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                {catalog.items.map((course) => {
                  const selected = selectedIds.includes(course.id);
                  const selectionFull = selectedIds.length >= 50 && !selected;

                  return (
                    <label
                      className={cn(
                        "grid cursor-pointer grid-cols-[80px_minmax(0,1fr)_24px] gap-3 rounded-lg border bg-background p-3 transition-colors focus-within:ring-2 focus-within:ring-ring sm:grid-cols-[96px_minmax(0,1fr)_24px]",
                        selected ? "border-primary bg-secondary" : "border-border hover:border-primary/35",
                        selectionFull && "cursor-not-allowed opacity-50"
                      )}
                      key={course.id}
                    >
                      <div className="aspect-video overflow-hidden rounded-md bg-secondary">
                        {course.coverUrl ? (
                          <ResponsiveImage usage="thumbnail" alt="" className="size-full object-cover" src={course.coverUrl} />
                        ) : (
                          <div className="flex size-full items-center justify-center">
                            <BookOpen className="size-5 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <span className="min-w-0">
                        <span className="line-clamp-1 block text-sm font-semibold">{course.name}</span>
                        <span className="mt-1 line-clamp-2 block text-xs leading-5 text-muted-foreground">{course.summary}</span>
                        <span className="mt-2 block text-xs text-muted-foreground">
                          {course.author.nickname} · {course.itemCount} 个课件
                        </span>
                      </span>
                      <span className={cn(
                        "mt-1 flex size-5 items-center justify-center rounded border",
                        selected ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card"
                      )}>
                        {selected ? <Check className="size-3.5" /> : null}
                      </span>
                      <input
                        checked={selected}
                        className="sr-only"
                        disabled={selectionFull}
                        onChange={() => setSelectedIds((current) => toggleCourseSelection(current, course.id))}
                        type="checkbox"
                      />
                    </label>
                  );
                })}
              </div>

              {pageCount > 1 ? (
                <div className="mt-5 flex items-center justify-center gap-3 border-t border-border pt-4">
                  <Button disabled={page <= 1} onClick={() => setPage((current) => current - 1)} type="button" variant="outline">
                    上一页
                  </Button>
                  <span className="text-sm text-muted-foreground">{page} / {pageCount}</span>
                  <Button disabled={page >= pageCount} onClick={() => setPage((current) => current + 1)} type="button" variant="outline">
                    下一页
                  </Button>
                </div>
              ) : null}
            </>
          ) : (
            <div className="flex min-h-56 items-center justify-center text-sm text-muted-foreground">
              {keyword || tag ? "没有符合条件的专辑" : "所有已发布专辑都已加入"}
            </div>
          )}
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4 sm:px-6">
          <p className="text-sm text-muted-foreground">已选择 {selectedIds.length} 门</p>
          <div className="flex items-center gap-2">
            <Button disabled={submitting} onClick={onClose} type="button" variant="outline">取消</Button>
            <Button disabled={selectedIds.length === 0 || submitting} onClick={() => void addSelectedCourses()} type="button">
              {submitting ? <Loader2 className="animate-spin" /> : <Plus />}
              加入专辑{selectedIds.length > 0 ? `（${selectedIds.length}）` : ""}
            </Button>
          </div>
        </footer>
      </div>
    </div>,
    document.body
  );
}
