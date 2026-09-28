"use client";

import { AlignLeft, BookOpen, Code2, ImageIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

import { MarkdownContent } from "@/components/markdown/markdown-content";
import {
  parseTextbookMarkdownReader,
  stripTextbookMarkdownToPlainText,
  type TextbookMarkdownReaderPage,
  type TextbookMarkdownReaderUnit
} from "@/lib/textbook-markdown-reader";
import { cn } from "@/lib/utils";

type NavigationMode = "pages" | "units";
type DisplayMode = "markdown" | "plainText" | "image";
type ReaderItem = TextbookMarkdownReaderPage | TextbookMarkdownReaderUnit;

interface TextbookMarkdownReaderProps {
  content: string;
}

export function TextbookMarkdownReader({ content }: TextbookMarkdownReaderProps) {
  const reader = useMemo(() => parseTextbookMarkdownReader(content), [content]);
  const [navigationMode, setNavigationMode] = useState<NavigationMode>("pages");
  const [displayMode, setDisplayMode] = useState<DisplayMode>("markdown");
  const [selectedPageId, setSelectedPageId] = useState(reader.pages[0]?.id ?? "");
  const [selectedUnitId, setSelectedUnitId] = useState(reader.units[0]?.id ?? "");
  const selectedPage = reader.pages.find((page) => page.id === selectedPageId) ?? reader.pages[0];
  const selectedUnit = reader.units.find((unit) => unit.id === selectedUnitId) ?? reader.units[0];
  const activeItem = navigationMode === "pages" ? selectedPage : selectedUnit;

  return (
    <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="rounded-md border border-border bg-card">
        <div className="border-b border-border p-4">
          <div className="grid grid-cols-2 rounded-md border border-border bg-muted p-1">
            <SegmentButton active={navigationMode === "pages"} onClick={() => setNavigationMode("pages")}>
              页面
            </SegmentButton>
            <SegmentButton active={navigationMode === "units"} onClick={() => setNavigationMode("units")}>
              单元
            </SegmentButton>
          </div>
        </div>
        <div className="max-h-[72vh] overflow-y-auto p-3">
          {navigationMode === "pages" ? (
            <div className="grid grid-cols-5 gap-2 sm:grid-cols-8 lg:grid-cols-5">
              {reader.pages.map((page) => (
                <ReaderPageButton
                  active={page.id === activeItem?.id}
                  key={page.id}
                  onClick={() => setSelectedPageId(page.id)}
                  page={page}
                />
              ))}
            </div>
          ) : (
            <div className="grid gap-2">
              {reader.units.map((unit) => (
                <ReaderNavButton
                  active={unit.id === activeItem?.id}
                  item={unit}
                  key={unit.id}
                  onClick={() => setSelectedUnitId(unit.id)}
                />
              ))}
            </div>
          )}
        </div>
      </aside>

      <section className="min-w-0 rounded-md border border-border bg-card">
        <div className="flex flex-col gap-4 border-b border-border p-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-muted-foreground">
              {navigationMode === "pages" ? "页面阅读" : "单元阅读"}
            </p>
            <h2 className="truncate text-xl font-bold">{activeItem?.title ?? "教材正文"}</h2>
          </div>
          <div className="grid w-full grid-cols-3 rounded-md border border-border bg-muted p-1 md:w-80">
            <SegmentButton active={displayMode === "markdown"} onClick={() => setDisplayMode("markdown")}>
              <Code2 className="size-4" data-icon="inline-start" />
              Markdown
            </SegmentButton>
            <SegmentButton active={displayMode === "plainText"} onClick={() => setDisplayMode("plainText")}>
              <AlignLeft className="size-4" data-icon="inline-start" />
              纯文字
            </SegmentButton>
            <SegmentButton active={displayMode === "image"} onClick={() => setDisplayMode("image")}>
              <ImageIcon className="size-4" data-icon="inline-start" />
              原图
            </SegmentButton>
          </div>
        </div>
        <div className="min-h-[60vh] p-4 md:p-6">
          <ReaderContent displayMode={displayMode} item={activeItem} />
        </div>
      </section>
    </div>
  );
}

function ReaderContent({ displayMode, item }: { displayMode: DisplayMode; item: ReaderItem | undefined }) {
  if (displayMode === "markdown") {
    return <MarkdownContent className="text-base leading-8" content={item?.markdown ?? ""} />;
  }

  if (displayMode === "plainText") {
    return <PlainTextPanel markdown={item?.markdown ?? ""} />;
  }

  return <OriginalImagePanel item={item} />;
}

function SegmentButton({
  active,
  children,
  onClick
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "inline-flex h-9 items-center justify-center gap-2 rounded-sm px-3 text-sm font-semibold transition-colors",
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
      )}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function ReaderNavButton({
  active,
  item,
  onClick
}: {
  active: boolean;
  item: TextbookMarkdownReaderUnit;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "flex min-h-14 w-full items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors",
        active
          ? "border-primary/35 bg-secondary text-foreground"
          : "border-transparent text-muted-foreground hover:border-border hover:bg-muted/70 hover:text-foreground"
      )}
      onClick={onClick}
      type="button"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-background text-primary">
        <BookOpen className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-foreground">{item.title}</span>
        <span className="mt-0.5 block text-xs">共 {item.pageNumbers.length} 页</span>
      </span>
    </button>
  );
}

function ReaderPageButton({
  active,
  onClick,
  page
}: {
  active: boolean;
  onClick: () => void;
  page: TextbookMarkdownReaderPage;
}) {
  return (
    <button
      aria-label={`查看第 ${page.pageNumber} 页`}
      className={cn(
        "flex h-10 w-full items-center justify-center rounded-md border text-sm font-semibold transition-colors",
        active
          ? "border-primary/35 bg-secondary text-foreground"
          : "border-border/70 bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
      onClick={onClick}
      title={page.title}
      type="button"
    >
      {page.pageNumber}
    </button>
  );
}

function OriginalImagePanel({ item }: { item: ReaderItem | undefined }) {
  const imageUrls = item?.imageUrls ?? [];

  if (!imageUrls.length) {
    return (
      <div className="flex min-h-64 items-center justify-center rounded-md border border-dashed border-border bg-muted text-sm text-muted-foreground">
        暂无原图
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      {imageUrls.map((imageUrl, index) => (
        <figure className="rounded-md border border-border bg-background p-3" key={`${imageUrl}-${index}`}>
          <img
            alt={`${item?.title ?? "教材"}原图 ${index + 1}`}
            className="mx-auto h-auto max-h-[86vh] w-full object-contain"
            loading="lazy"
            src={imageUrl}
          />
        </figure>
      ))}
    </div>
  );
}

function PlainTextPanel({ markdown }: { markdown: string }) {
  const plainText = useMemo(() => stripTextbookMarkdownToPlainText(markdown), [markdown]);

  if (!plainText) {
    return (
      <div className="flex min-h-64 items-center justify-center rounded-md border border-dashed border-border bg-muted text-sm text-muted-foreground">
        暂无文字内容
      </div>
    );
  }

  return <div className="whitespace-pre-wrap text-base leading-8 text-foreground">{plainText}</div>;
}
