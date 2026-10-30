import { fromMarkdown } from "mdast-util-from-markdown";
import { toMarkdown } from "mdast-util-to-markdown";
import { mathFromMarkdown } from "mdast-util-math";
import { math } from "micromark-extension-math";
import { imageSources } from "./image-delivery";
import { hasSignedUrlParameters, publicR2CdnUrl } from "./public-r2-cdn";

type MarkdownNode = {
  type: string;
  url?: string;
  alt?: string | null;
  identifier?: string;
  title?: string | null;
  position?: { start: { offset?: number }; end: { offset?: number } };
  children?: MarkdownNode[];
};

/** Only transform actual image nodes in public Markdown; preserve links and code. */
export function rewritePublicMarkdownImages(markdown: string): string {
  if (!markdown.includes("https://r.abeiai.com/")) return markdown;
  const tree = fromMarkdown(markdown, { extensions: [math()], mdastExtensions: [mathFromMarkdown()] }) as unknown as MarkdownNode;
  const definitions = new Map<string, { url: string; title: string | null }>();
  const images: MarkdownNode[] = [];
  function visit(node: MarkdownNode) {
    if (node.type === "definition" && node.identifier && node.url && !definitions.has(node.identifier)) definitions.set(node.identifier, { url: node.url, title: node.title ?? null });
    if (node.type === "image" || node.type === "imageReference") images.push(node);
    node.children?.forEach(visit);
  }
  visit(tree);
  const edits: Array<{ start: number; end: number; text: string }> = [];
  for (const image of images) {
    const definition = image.type === "imageReference" ? definitions.get(image.identifier ?? "") : undefined;
    const source = image.type === "image" ? image.url : definition?.url;
    const start = image.position?.start.offset;
    const end = image.position?.end.offset;
    if (!source || start === undefined || end === undefined || publicR2CdnUrl(source) === source) continue;
    const delivered = imageSources(source, "reading").src;
    const serialized = toMarkdown({ type: "root", children: [{ type: "paragraph", children: [{ type: "image", url: delivered, alt: image.alt ?? "", title: image.title ?? definition?.title ?? null }] }] }).trimEnd();
    edits.push({ start, end, text: serialized });
  }
  return edits.sort((a, b) => b.start - a.start).reduce((text, edit) => text.slice(0, edit.start) + edit.text + text.slice(edit.end), markdown);
}

export function publicMarkdownImageFallback(currentSrc: string): string | null {
  try {
    const url = new URL(currentSrc, "https://local.invalid");
    const source = url.pathname === "/_next/image" ? url.searchParams.get("url") : currentSrc;
    return source?.startsWith("https://cdn.abeiai.com/") && !hasSignedUrlParameters(source) ? `https://r.abeiai.com${source.slice("https://cdn.abeiai.com".length)}` : null;
  } catch {
    return null;
  }
}
