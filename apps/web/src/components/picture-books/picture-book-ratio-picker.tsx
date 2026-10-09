"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

export const pictureBookAspectRatios = ["21:10", "16:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16"] as const;
export type PictureBookAspectRatio = typeof pictureBookAspectRatios[number];

function RatioOutline({ ratio }: { ratio: PictureBookAspectRatio }) {
  const [width, height] = ratio.split(":").map(Number);
  const scale = 28 / Math.max(width!, height!);
  return <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center"><span className="rounded-[3px] border-2 border-current" style={{ width: width! * scale, height: height! * scale }} /></span>;
}

export function PictureBookRatioPicker({ value, disabled, onChange }: {
  value: PictureBookAspectRatio; disabled?: boolean; onChange(value: PictureBookAspectRatio): void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 600 });
  useEffect(() => { if (disabled) popover.current?.hidePopover(); }, [disabled]);

  function toggle() {
    if (open) { popover.current?.hidePopover(); return; }
    const anchor = trigger.current?.getBoundingClientRect();
    if (!anchor) return;
    const width = Math.min(600, window.innerWidth - 32);
    const left = Math.max(16, Math.min(anchor.right - width, window.innerWidth - width - 16));
    popover.current?.showPopover();
    const height = popover.current?.getBoundingClientRect().height ?? 0;
    const top = anchor.bottom + 8 + height > window.innerHeight ? Math.max(16, anchor.top - height - 8) : anchor.bottom + 8;
    setPosition({ top, left, width });
  }

  return <div className="space-y-2">
    <span id={`${id}-label`} className="text-sm font-semibold">画面比例</span>
    <button ref={trigger} type="button" aria-label={`画面比例：${value}`} aria-haspopup="dialog" aria-expanded={open} aria-controls={id} disabled={disabled} onClick={toggle} className="flex w-full items-center gap-3 rounded-xl border border-border bg-background px-3 py-2 text-sm disabled:opacity-50">
      <RatioOutline ratio={value} /><span>{value}</span><ChevronDown className="ml-auto size-4 text-muted-foreground" />
    </button>
    <div ref={popover} id={id} popover="auto" role="dialog" aria-labelledby={`${id}-title`} onToggle={event => setOpen(event.newState === "open")} style={position} className="fixed m-0 max-h-[calc(100dvh-32px)] overflow-y-auto rounded-2xl border border-border bg-background p-4 text-foreground shadow-xl">
      <h2 id={`${id}-title`} className="mb-3 text-sm font-semibold text-muted-foreground">选择画面比例</h2>
      <div className="grid grid-cols-5 gap-2 rounded-xl bg-secondary p-1">
        {pictureBookAspectRatios.map(ratio => <button key={ratio} type="button" aria-label={ratio} aria-pressed={value === ratio} disabled={disabled} onClick={() => { onChange(ratio); popover.current?.hidePopover(); trigger.current?.focus(); }} className={`flex min-w-0 flex-col items-center gap-2 rounded-xl border px-1 py-3 text-sm transition hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${value === ratio ? "border-primary bg-primary/10 text-primary" : "border-transparent"}`}>
          <RatioOutline ratio={ratio} /><span>{ratio}</span>
        </button>)}
      </div>
    </div>
  </div>;
}
