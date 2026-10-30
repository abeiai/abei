import Link from "next/link";
import { ArrowRight, BookOpen, Download, LibraryBig } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ResponsiveImage } from "@/components/ui/responsive-image";
import {
  getPublicTextbookMarkdownViewUrl,
  getPublicTextbookPdfDownloadUrl,
  type PublicTextbookListItem,
  type PublicTextbookListResult
} from "@/lib/textbook-public-api";
import {
  textbookGradeRoutes,
  textbookPath,
  textbookSubjectSegment,
  textbookTypeRoutes,
  textbookVersionSegment,
  type TextbookRouteFilters
} from "@/lib/textbook-seo";

export function TextbookBreadcrumbs({ items }: { items: Array<{ href: string; label: string }> }) {
  return (
    <nav className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground" aria-label="面包屑">
      {items.map((item, index) => (
        <span className="flex items-center gap-2" key={item.href}>
          {index > 0 ? <span aria-hidden="true">&raquo;</span> : null}
          <Link className="hover:text-foreground" href={item.href}>
            {item.label}
          </Link>
        </span>
      ))}
    </nav>
  );
}

export function TextbookDirectoryLinks({
  filters
}: {
  filters: PublicTextbookListResult["filters"];
}) {
  const subjects = filters.subjects.slice(0, 14);
  const versions = filters.versions.slice(0, 18);
  const renjiaoVersion = filters.versions.find((item) => item.value === "人教版" || item.value.includes("人教"))?.value;
  const hotCombos = [
    { educationType: "PRIMARY", grade: "一年级", subject: "数学" },
    { educationType: "PRIMARY", grade: "三年级", subject: "英语" },
    { educationType: "JUNIOR", grade: "七年级", subject: "语文" },
    { educationType: "JUNIOR", grade: "七年级", subject: "道德与法治" },
    { educationType: "SENIOR", grade: "高一", subject: "数学" },
    renjiaoVersion
      ? { educationType: "PRIMARY", grade: "三年级", subject: "数学", version: renjiaoVersion }
      : null
  ].filter((item): item is { educationType: string; grade: string; subject: string; version?: string } => Boolean(item));

  return (
    <section className="textbook-directory">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-bold text-muted-foreground">资源索引</p>
        <h2 className="font-display text-4xl font-extrabold leading-tight tracking-normal">按目录查找</h2>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <DirectoryGroup
          title="按类型找教材"
          links={textbookTypeRoutes.map((item) => ({
            href: textbookPath({ educationType: item.value }),
            label: `${item.label}电子教材`
          }))}
        />
        <DirectoryGroup
          title="按年级找教材"
          links={textbookGradeRoutes.slice(0, 12).map((item) => ({
            href: textbookPath({ grade: item.value }),
            label: `${item.value}教材`
          }))}
        />
        <DirectoryGroup
          title="按学科找教材"
          links={subjects.map((item) => ({
            href: `/textbook/${textbookSubjectSegment(item.value)}`,
            label: `${item.label}教材`
          }))}
        />
        <DirectoryGroup
          title="按版本找教材"
          links={versions.map((item) => ({
            href: `/textbook/${textbookVersionSegment(item.value)}`,
            label: `${item.label}教材`
          }))}
        />
        <div className="lg:col-span-2">
          <DirectoryGroup
            title="热门教材组合"
            links={hotCombos.map((item) => ({
              href: textbookPath(item),
              label: `${item.grade}${item.subject}${item.version ?? ""}教材`
            }))}
          />
        </div>
      </div>
    </section>
  );
}

function DirectoryGroup({
  links,
  title
}: {
  links: Array<{ href: string; label: string }>;
  title: string;
}) {
  return (
    <div className="textbook-directory-group">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-extrabold">{title}</h3>
        <LibraryBig className="size-4 text-primary" />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {links.map((link) => (
          <Link className="textbook-index-link" href={link.href} key={link.href}>
            {link.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

export function TextbookCards({ textbooks }: { textbooks: PublicTextbookListItem[] }) {
  if (textbooks.length === 0) {
    return (
      <div className="rounded-md border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        暂无符合条件的教材资源。
      </div>
    );
  }

  return (
    <div className="textbook-book-grid">
      {textbooks.map((textbook) => (
        <article className="textbook-book-card" key={textbook.id}>
          <Link className="textbook-book-cover" href={`/textbook/${textbook.slug}`}>
            <span className="textbook-book-spine" />
            {textbook.coverUrl ? (
              <ResponsiveImage usage="card" alt={`${textbook.title}封面`} src={textbook.coverUrl} />
            ) : (
              <span className="textbook-cover-placeholder">
                <BookOpen />
              </span>
            )}
          </Link>
          <div className="textbook-book-info flex min-w-0 flex-1 flex-col gap-3">
            <div className="flex flex-col gap-2">
              <h3 className="line-clamp-2 text-lg font-extrabold leading-6">
                <Link href={`/textbook/${textbook.slug}`}>{textbook.title}</Link>
              </h3>
              <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">
                {textbook.grade} · {textbook.subject} · {textbook.version}
              </p>
            </div>
            <div className="mt-auto flex flex-wrap justify-end gap-2">
              <Button asChild size="sm" variant="outline">
                <Link href={`/textbook/${textbook.slug}`}>
                  详情
                  <ArrowRight data-icon="inline-end" />
                </Link>
              </Button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

export function TextbookResourceShelf({
  eyebrow,
  href,
  textbooks,
  title
}: {
  eyebrow: string;
  href: string;
  textbooks: PublicTextbookListItem[];
  title: string;
}) {
  if (textbooks.length === 0) {
    return null;
  }

  return (
    <section className="textbook-resource-shelf">
      <div className="textbook-resource-shelf-head">
        <div>
          <p className="text-sm font-bold text-muted-foreground">{eyebrow}</p>
          <h2 className="text-2xl font-extrabold">{title}</h2>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href={href}>
            查看全部
            <ArrowRight data-icon="inline-end" />
          </Link>
        </Button>
      </div>
      <div className="textbook-resource-row">
        {textbooks.map((textbook) => {
          const pdfDownloadUrl = getPublicTextbookPdfDownloadUrl(textbook);
          const markdownViewUrl = textbook.hasMarkdownContent ? getPublicTextbookMarkdownViewUrl(textbook.slug) : null;

          return (
            <article className="textbook-resource-card" key={textbook.id}>
              <Link className="textbook-resource-cover" href={`/textbook/${textbook.slug}`}>
                {textbook.coverUrl ? <ResponsiveImage usage="card" alt={`${textbook.title}封面`} src={textbook.coverUrl} /> : <BookOpen />}
              </Link>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <h3 className="line-clamp-2 text-sm font-extrabold leading-5">
                  <Link href={`/textbook/${textbook.slug}`}>{textbook.title}</Link>
                </h3>
                <p className="truncate text-xs font-semibold text-muted-foreground">
                  {textbook.grade} · {textbook.subject} · {textbook.version}
                </p>
                <div className="mt-auto flex gap-2">
                  {pdfDownloadUrl ? (
                    <Button asChild size="sm">
                      <a href={pdfDownloadUrl}>
                        <Download data-icon="inline-start" />
                        PDF
                      </a>
                    </Button>
                  ) : null}
                  {markdownViewUrl ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href={markdownViewUrl}>正文</Link>
                    </Button>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function TextbookPagination({
  filters,
  pagination
}: {
  filters: TextbookRouteFilters;
  pagination: PublicTextbookListResult["pagination"];
}) {
  if (pagination.totalPages <= 1) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-5 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
      <span>
        第 {pagination.page} / {pagination.totalPages} 页，共 {pagination.total} 本教材
      </span>
      <div className="flex flex-wrap gap-2">
        {pagination.page > 1 ? (
          <Button asChild size="sm" variant="outline">
            <Link href={textbookPath({ ...filters, page: pagination.page - 1 })}>上一页</Link>
          </Button>
        ) : null}
        {pagination.page < pagination.totalPages ? (
          <Button asChild size="sm" variant="outline">
            <Link href={textbookPath({ ...filters, page: pagination.page + 1 })}>下一页</Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function TextbookInfoTable({ textbook }: { textbook: PublicTextbookListItem }) {
  const items = [
    textbook.subject,
    textbook.version,
    textbook.educationTypeName,
    textbook.grade,
    textbook.volumeName,
    textbook.curriculumStandardYear ? `${textbook.curriculumStandardYear}年版课标` : null,
    textbook.editionYear ? `版本时间：${textbook.editionYear}` : null,
    textbook.markdownPageCount ? `${textbook.markdownPageCount}页` : null
  ].filter(Boolean);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium text-muted-foreground">
      {items.map((item) => (
        <span key={item}>{item}</span>
      ))}
    </div>
  );
}
