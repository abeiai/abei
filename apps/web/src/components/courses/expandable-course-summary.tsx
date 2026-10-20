"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export function ExpandableCourseSummary({ text }: { text: string }) {
  const paragraphRef = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const paragraph = paragraphRef.current;

    if (!paragraph || expanded) {
      return;
    }

    const updateOverflow = () => {
      setOverflowing(paragraph.scrollHeight > paragraph.clientHeight + 1);
    };

    updateOverflow();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(updateOverflow);
    observer.observe(paragraph);

    return () => observer.disconnect();
  }, [expanded, text]);

  return (
    <div className="relative max-w-3xl">
      <p
        className={cn(
          "whitespace-pre-wrap text-sm leading-6 text-muted-foreground",
          !expanded && "line-clamp-4"
        )}
        ref={paragraphRef}
      >
        {text}
      </p>
      <button
        aria-expanded={expanded}
        aria-label="展开完整专辑简介"
        className={cn(
          "absolute bottom-0 right-0 bg-gradient-to-l from-background via-background to-transparent pl-8 text-sm leading-6 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          (!overflowing || expanded) && "hidden"
        )}
        onClick={() => setExpanded(true)}
        type="button"
      >
        … 展开
      </button>
    </div>
  );
}
