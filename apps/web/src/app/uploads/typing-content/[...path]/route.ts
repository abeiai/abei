import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const mimeTypes: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav"
};

export async function GET(_request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  if (path.length === 0 || path.some((segment) => !segment || segment === "." || segment === "..")) {
    return new Response("资源不存在", { status: 404 });
  }
  const roots = [
    resolve(process.cwd(), "../../uploads/typing-content"),
    resolve(process.cwd(), "uploads/typing-content")
  ];
  for (const root of roots) {
    const filename = resolve(root, ...path);
    if (!filename.startsWith(`${root}${sep}`)) continue;
    try {
      const content = await readFile(filename);
      return new Response(content, {
        headers: {
          "Cache-Control": "public, max-age=86400",
          "Content-Type": mimeTypes[extname(filename).toLowerCase()] ?? "application/octet-stream"
        }
      });
    } catch {
      // 尝试下一个明确限定的本地内容根目录。
    }
  }
  return new Response("资源不存在", { status: 404 });
}
