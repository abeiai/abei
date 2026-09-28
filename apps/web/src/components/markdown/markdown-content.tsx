"use client";

import { IncremarkContent } from "@incremark/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { normalizeMarkdownForIncremark } from "@/lib/markdown-normalize";
import { cn } from "@/lib/utils";

interface MarkdownContentProps {
  className?: string;
  content: string;
  isStreaming?: boolean;
}

const baseIncremarkOptions = {
  containers: true,
  gfm: true,
  htmlTree: false,
  math: {
    tex: true
  }
} as const;

export function MarkdownContent({ className, content, isStreaming = false }: MarkdownContentProps) {
  const progressiveContent = useProgressiveMarkdown(content, isStreaming);
  const isProgressivelyRendering = isStreaming || progressiveContent !== content;
  const normalizedContent = useMemo(() => normalizeMarkdownForIncremark(content), [content]);
  const renderedContent = isProgressivelyRendering ? progressiveContent : normalizedContent;
  const renderMode = isProgressivelyRendering ? "streaming" : "finished";

  return (
    <div className={cn("xueleai-markdown", className)}>
      <IncremarkContent
        content={renderedContent}
        incremarkOptions={baseIncremarkOptions}
        isFinished={!isProgressivelyRendering}
        key={renderMode}
        pendingClass="xueleai-markdown-pending"
        showBlockStatus={false}
      />
    </div>
  );
}

function useProgressiveMarkdown(content: string, isStreaming: boolean) {
  const [visibleContent, setVisibleContent] = useState(content);
  const targetRef = useRef(content);
  const visibleRef = useRef(content);
  const wasStreamingRef = useRef(isStreaming);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    visibleRef.current = visibleContent;
  }, [visibleContent]);

  const clearRevealTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const scheduleReveal = useCallback(() => {
    if (timerRef.current) {
      return;
    }

    const tick = () => {
      let shouldContinue = false;

      setVisibleContent((current) => {
        const target = targetRef.current;

        if (!target.startsWith(current)) {
          return target;
        }

        if (current.length >= target.length) {
          return current;
        }

        const remaining = target.length - current.length;
        const step = Math.min(8, Math.max(2, Math.ceil(remaining / 90)));
        const next = target.slice(0, current.length + step);

        shouldContinue = next.length < target.length;
        return next;
      });

      if (shouldContinue) {
        timerRef.current = window.setTimeout(tick, 18);
      } else {
        timerRef.current = null;
      }
    };

    timerRef.current = window.setTimeout(tick, 18);
  }, []);

  useEffect(() => {
    targetRef.current = content;

    if (!isStreaming && !wasStreamingRef.current) {
      clearRevealTimer();
      setVisibleContent(content);
      return;
    }

    if (!content.startsWith(visibleRef.current)) {
      clearRevealTimer();
      setVisibleContent(content);
      wasStreamingRef.current = isStreaming;
      return;
    }

    scheduleReveal();
    wasStreamingRef.current = isStreaming;
  }, [clearRevealTimer, content, isStreaming, scheduleReveal]);

  useEffect(() => clearRevealTimer, [clearRevealTimer]);

  return visibleContent;
}
