"use client";
import type { PictureBookTextBox } from "@/lib/picture-book-text-layout";

export function PictureBookTextOverlay({ boxes }: { boxes: PictureBookTextBox[] }) {
  return <div className="pointer-events-none absolute inset-0" style={{ containerType: "inline-size" }}>
    {boxes.map(box => <div key={box.id} style={{ position: "absolute", zIndex: box.zIndex ?? 0, left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%`, fontSize: `${box.fontSize / 10}cqw`, fontFamily: box.fontFamily === "serif" ? "serif" : "sans-serif", color: box.color, fontWeight: box.bold ? 700 : 400, textAlign: box.align, lineHeight: box.lineHeight, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{box.text}</div>)}
  </div>;
}
