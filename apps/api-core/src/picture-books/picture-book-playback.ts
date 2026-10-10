type PlaybackPage = {
  position: number;
  caption: string;
  narration: string;
  imageUrl: string | null;
  audioUrl: string | null;
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function string(value: unknown) {
  return typeof value === "string" ? value : "";
}

function url(value: unknown) {
  return typeof value === "string" && (/^https?:\/\//.test(value) || /^\/(?!\/)[a-zA-Z0-9/_\-.]+$/.test(value))
    ? value
    : null;
}

export function playbackFromSnapshot(id: string, snapshot: unknown) {
  const source = object(snapshot);
  const pages: PlaybackPage[] = (Array.isArray(source.pages) ? source.pages : [])
    .map((value) => object(value))
    .filter((page) => Number.isInteger(page.position) && Number(page.position) >= 0)
    .map((page) => ({
      position: Number(page.position),
      caption: string(page.caption),
      narration: string(page.narration) || string(page.caption),
      imageUrl: url(page.imageUrl),
      audioUrl: url(page.audioUrl)
    }))
    .sort((a, b) => a.position - b.position);
  return {
    id,
    title: string(source.title),
    style: string(source.style),
    aspectRatio: string(source.aspectRatio) || "1:1",
    isSpread: source.isSpread === true,
    pages
  };
}
