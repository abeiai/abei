import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { AppException } from "../common/app-exception.js";
import { inspectImage } from "../media/image-inspection.js";
const execute = promisify(execFile);

// Fit the complete artwork and title onto the same canvas for both model input and library output.
export async function normalizePictureBookLibraryCover(buffer: Buffer) {
  const source = inspectImage(buffer);
  if (!source || buffer.length > 10 * 1024 * 1024 || source.width > 8192 || source.height > 8192) throw new AppException(40001, "绘本封面图片无效", 400);
  if (source.width === 1536 && source.height === 1152) return buffer;
  const directory = await mkdtemp(join(tmpdir(), "abei-library-cover-"));
  try {
    const input = join(directory, "source"), output = join(directory, "cover.png");
    await writeFile(input, buffer);
    await execute("ffmpeg", ["-nostdin", "-v", "error", "-i", input, "-vf", "scale=1536:1152:force_original_aspect_ratio=decrease,pad=1536:1152:(ow-iw)/2:(oh-ih)/2:color=0xf6f0e5,setsar=1,format=rgb24", "-frames:v", "1", "-threads", "1", "-y", output], { timeout: 30000, maxBuffer: 1024 * 1024 });
    return await readFile(output);
  } finally { await rm(directory, { recursive: true, force: true }); }
}
