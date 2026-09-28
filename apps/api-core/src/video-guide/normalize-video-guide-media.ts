import { extname } from "node:path";
import { getPrismaClient } from "@xueleai/database";
import { VideoGuideService } from "./video-guide.service.js";

const prisma = getPrismaClient();
const service = new VideoGuideService(undefined as never, undefined as never);

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`视频导学媒体标准化失败：${message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

async function main() {
  const shareToken = process.env.VIDEO_GUIDE_SHARE_TOKEN?.trim() || readArgValue("--share-token");

  if (shareToken) {
    await service.normalizeLessonMediaForWebByShareToken(shareToken);
    console.log("已标准化指定课件媒体。");
    return;
  }

  const limit = positiveInteger(process.env.VIDEO_GUIDE_NORMALIZE_LIMIT, 20);
  const lessons = await prisma.videoGuideLesson.findMany({
    orderBy: {
      createdAt: "desc"
    },
    take: limit,
    where: {
      mediaType: "VIDEO",
      mediaUrl: {
        not: null
      }
    }
  });
  let completed = 0;
  let skipped = 0;

  for (const lesson of lessons) {
    if (lesson.mediaMimeType?.toLowerCase() === "video/mp4" && extname(lesson.mediaUrl ?? "").toLowerCase() === ".mp4") {
      skipped += 1;
      continue;
    }

    await service.normalizeLessonMediaForWebByShareToken(lesson.shareToken);
    completed += 1;
  }

  console.log(`视频导学媒体标准化完成：处理 ${completed} 个，跳过 ${skipped} 个。`);
}

function readArgValue(name: string) {
  const prefix = `${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));

  return found ? found.slice(prefix.length).trim() : "";
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
