"use client";

import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import type { PictureBookTextBox } from "@/lib/picture-book-text-layout";
import { pictureBookAnnotationPath, pictureBookRegionVerticalInset, type CanvasSize } from "@/lib/picture-book-text-region";

export function usePictureBookCanvasSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState<CanvasSize>({ width: 0, height: 0 });
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

export function pictureBookBoxTypography(box: PictureBookTextBox): CSSProperties {
  return {
    fontSize: `${box.fontSize / 10}cqw`, fontFamily: box.fontFamily === "serif" ? "serif" : "sans-serif",
    color: box.color, fontWeight: box.bold ? 700 : 400, textAlign: box.align, lineHeight: String(box.lineHeight),
    whiteSpace: "pre-wrap", overflowWrap: "anywhere",
    padding: box.shape === "cloud" ? "0 21%" : box.shape === "ellipse" ? "0 14%" : box.shape ? ".7cqw 1.2cqw" : "0"
  };
}

export function pictureBookBoxPosition(box: PictureBookTextBox): CSSProperties {
  return { left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%` };
}

export function PictureBookRegionDecoration({ box, canvas }: { box: PictureBookTextBox; canvas: CanvasSize }) {
  const background = box.backgroundColor ?? "#ffffff";
  const opacity = box.backgroundOpacity ?? (box.backgroundColor ? 1 : 0);
  const borderWidth = box.borderWidth ?? 0;
  const borderColor = box.borderColor ?? "#8fa4be";
  const radius = box.cornerRadius ?? 0;
  if (!box.shape) {
    if (!opacity && !borderWidth) return null;
    return <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{
      backgroundColor: opacity ? `color-mix(in srgb, ${background} ${opacity * 100}%, transparent)` : undefined,
      border: borderWidth ? `${borderWidth / 10}cqw solid ${borderColor}` : undefined,
      borderRadius: `${radius / 10}cqw`
    }} />;
  }
  const width = box.width * canvas.width, height = box.height * canvas.height;
  if (!width || !height) return null;
  const tip = box.tail ? { x: (box.tail.x - box.x) * canvas.width, y: (box.tail.y - box.y) * canvas.height } : undefined;
  return <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 ${width} ${height}`}>
    <path d={pictureBookAnnotationPath(width, height, box.shape, radius * canvas.width / 1000, tip)} fill={background} fillOpacity={opacity} stroke={borderWidth ? borderColor : "none"} strokeWidth={borderWidth * canvas.width / 1000} strokeLinejoin="round" />
  </svg>;
}

export function PictureBookTextOverlay({ boxes }: { boxes: PictureBookTextBox[] }) {
  const canvas = useRef<HTMLDivElement>(null);
  const size = usePictureBookCanvasSize(canvas);
  return <div ref={canvas} className="pointer-events-none absolute inset-0" style={{ containerType: "inline-size" }}>
    {boxes.map(box => <div key={box.id} className="absolute" style={{ ...pictureBookBoxPosition(box), zIndex: box.zIndex ?? 0 }}>
      <PictureBookRegionDecoration box={box} canvas={size} />
      <div className="absolute inset-x-0" style={{ ...pictureBookBoxTypography(box), top: `${pictureBookRegionVerticalInset(box.shape) * 100}%` }}>{box.text}</div>
    </div>)}
  </div>;
}
