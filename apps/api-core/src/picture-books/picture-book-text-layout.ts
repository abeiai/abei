export type PictureBookTextBox = {
  id: string; text: string; x: number; y: number; width: number; height: number;
  fontSize: number; fontFamily: "sans" | "serif"; color: string; bold: boolean;
  align: "left" | "center" | "right"; lineHeight: number; speak: boolean; zIndex?: number;
};
export type PictureBookTextVersion = { language: string; boxes: PictureBookTextBox[]; audioUrl: string | null; voiceKey?: string };
export type PictureBookTextLayout = { enabled: boolean; versions: PictureBookTextVersion[] };

export function layoutNarration(version: Pick<PictureBookTextVersion, "boxes">): string {
  return version.boxes.filter(box => box.speak && box.text.trim()).map(box => box.text.trim()).join("\n");
}

export function parseTextLayout(input: unknown): PictureBookTextLayout {
  const fail = (): never => { throw new Error("图文编排数据无效，请检查后重试"); };
  if (!input || typeof input !== "object" || Array.isArray(input)) return fail();
  if (JSON.stringify(input).length > 180000) return fail();
  const value = input as Record<string, unknown>;
  if (typeof value.enabled !== "boolean" || !Array.isArray(value.versions) || value.versions.length > 21) return fail();
  const versions: PictureBookTextVersion[] = value.versions.map((item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return fail();
    const version = item as Record<string, unknown>;
    if (typeof version.language !== "string" || !/^(original|[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-[A-Z]{2})?)$/.test(version.language) || version.language === "zh" || !Array.isArray(version.boxes) || version.boxes.length > 50) return fail();
    const boxes: PictureBookTextBox[] = version.boxes.map((item: unknown) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return fail();
      const box = item as Record<string, unknown>;
      const n = (key: string, min: number, max: number): number => typeof box[key] === "number" && Number.isFinite(box[key]) && (box[key] as number) >= min && (box[key] as number) <= max ? box[key] as number : fail();
      if (typeof box.id !== "string" || !/^[\w-]{1,80}$/.test(box.id) || typeof box.text !== "string" || box.text.length > 1000 || !["sans", "serif"].includes(String(box.fontFamily)) || typeof box.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(box.color) || typeof box.bold !== "boolean" || !["left", "center", "right"].includes(String(box.align)) || typeof box.speak !== "boolean") return fail();
      const x = n("x", 0, 1), y = n("y", 0, 1), width = n("width", 0.01, 1), height = n("height", 0.01, 1);
      if (x + width > 1.00001 || y + height > 1.00001) return fail();
      return { id: box.id, text: box.text, x, y, width, height, fontSize: n("fontSize", 8, 160), fontFamily: box.fontFamily as "sans" | "serif", color: box.color, bold: box.bold, align: box.align as "left" | "center" | "right", lineHeight: n("lineHeight", 0.8, 3), speak: box.speak, zIndex: box.zIndex === undefined ? 0 : n("zIndex", 0, 100) };
    });
    if (new Set(boxes.map(box => box.id)).size !== boxes.length) return fail();
    if (version.voiceKey !== undefined && (typeof version.voiceKey !== "string" || version.voiceKey.length > 166 || !/^(voice|system):.+/.test(version.voiceKey))) return fail();
    return { language: version.language, boxes, ...(typeof version.voiceKey === "string" ? { voiceKey: version.voiceKey } : {}), audioUrl: typeof version.audioUrl === "string" && (/^https?:\/\//.test(version.audioUrl) || /^\/(?!\/)[a-zA-Z0-9/_\-.]+$/.test(version.audioUrl)) ? version.audioUrl : null };
  });
  if (new Set(versions.map(version => version.language)).size !== versions.length) return fail();
  return { enabled: value.enabled, versions };
}

export function mergeTextLayout(input: unknown, previous?: PictureBookTextLayout): PictureBookTextLayout {
  const layout = parseTextLayout(input);
  return { ...layout, versions: layout.versions.map(version => {
    const old = previous?.versions.find(item => item.language === version.language);
    return { ...version, audioUrl: old && old.voiceKey === version.voiceKey && layoutNarration(old) === layoutNarration(version) ? old.audioUrl : null };
  }) };
}

export function publicTextLayout(input: unknown): PictureBookTextLayout {
  const layout = parseTextLayout(input);
  return { ...layout, versions: layout.versions.map(({ language, boxes, audioUrl }) => ({ language, boxes, audioUrl })) };
}

export function preserveCreatorTextLayouts<T extends { position: number }>(previous: unknown, pages: T[]): Array<T & { textLayout?: PictureBookTextLayout }> {
  const old = Array.isArray(previous) ? previous : [];
  const layouts = new Map<number, PictureBookTextLayout>();
  for (const value of old) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const page = value as Record<string, unknown>;
    if (typeof page.position === "number" && page.textLayout) layouts.set(page.position, parseTextLayout(page.textLayout));
  }
  if ([...layouts.keys()].some(position => !pages.some(page => page.position === position))) throw new Error("页面包含图文编排，请先在网页中处理文字后再删除页面");
  return pages.map(page => ({ ...page, ...(layouts.has(page.position) ? { textLayout: layouts.get(page.position)! } : {}) }));
}
