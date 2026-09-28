import { mkdir, readFile, rename, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import {
  buildIllustrationPrompt,
  buildMediaAssetRegistration,
  mediaInputHash,
  typingMediaRelativePath,
  type TypingMediaKind
} from "./typing-media-manifest.js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export async function inspectTypingMediaFile(path: string, kind: TypingMediaKind) {
  const file = await readFile(path);

  if (file.length === 0) {
    throw new Error(kind === "ILLUSTRATION" ? "图片文件为空" : "音频文件为空");
  }

  if (kind === "ILLUSTRATION") {
    const metadata = await sharp(file).metadata();

    if (metadata.format !== "png") {
      throw new Error("图片格式必须为 PNG");
    }

    if (metadata.width !== 1024 || metadata.height !== 768) {
      throw new Error("图片尺寸必须为 1024×768");
    }

    return {
      hash: mediaInputHash(file),
      height: metadata.height,
      size: file.length,
      width: metadata.width
    };
  }

  return {
    hash: mediaInputHash(file),
    height: null,
    size: file.length,
    width: null
  };
}

export async function prepareTypingImage(sourcePath: string, outputPath: string) {
  await mkdir(dirname(outputPath), { recursive: true });
  const partialPath = `${outputPath}.part`;
  await sharp(sourcePath)
    .resize(1024, 768, {
      fit: "cover",
      position: "attention"
    })
    .png({
      compressionLevel: 9,
      quality: 92
    })
    .toFile(partialPath);
  await rename(partialPath, outputPath);
}

async function registerTypingMedia() {
  const args = process.argv.slice(2);
  const unitNumber = integerArg(args, "--unit") ?? 1;
  const kind = mediaKindArg(args);
  const bookKey = stringArg(args, "--book") ?? "7a";
  const { getPrismaClient } = await import("../../packages/database/src/index.js");
  const { getTypingLibraryConfig } = await import("../../packages/database/prisma/typing-library-config.js");
  const libraryConfig = getTypingLibraryConfig(bookKey);
  const prisma = getPrismaClient();

  try {
    const unit = await prisma.englishContentUnit.findFirst({
      where: {
        code: `unit-${String(unitNumber).padStart(2, "0")}`,
        library: {
          slug: libraryConfig.librarySlug
        }
      },
      include: {
        items: {
          orderBy: {
            sourceOrder: "asc"
          },
          include: {
            media: true
          }
        }
      }
    });

    if (!unit) {
      throw new Error(`未找到 Unit ${unitNumber} 内容`);
    }

    let registered = 0;
    const failures: string[] = [];

    for (const item of unit.items) {
      const relativePath = typingMediaRelativePath(item, unitNumber, kind, libraryConfig.assetKey);
      const absolutePath = resolve(projectRoot, relativePath);
      const allowedRoot = resolve(projectRoot, `uploads/typing-content/${libraryConfig.assetKey}`);

      if (!absolutePath.startsWith(`${allowedRoot}/`)) {
        throw new Error("媒体文件路径超出允许目录");
      }

      const slot = item.media.find((entry) => entry.kind === kind);

      if (!slot) {
        throw new Error(`${item.text} 缺少 ${kind} 媒体槽位`);
      }

      try {
        await stat(absolutePath);
        const inspected = await inspectTypingMediaFile(absolutePath, kind);
        const assetInput = buildMediaAssetRegistration({
          kind,
          relativePath,
          size: inspected.size
        });
        const prompt = kind === "ILLUSTRATION" ? buildIllustrationPrompt(item) : null;

        await prisma.$transaction(async (transaction) => {
          const mediaAsset = slot.mediaAssetId
            ? await transaction.mediaAsset.update({
                where: {
                  id: slot.mediaAssetId
                },
                data: assetInput
              })
            : await transaction.mediaAsset.create({
                data: assetInput
              });

          await transaction.englishContentMedia.update({
            where: {
              id: slot.id
            },
            data: {
              mediaAssetId: mediaAsset.id,
              status: "READY",
              prompt,
              inputHash: inspected.hash,
              errorMessage: null
            }
          });
        });
        registered += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "媒体文件登记失败";
        failures.push(`${item.sourceOrder}. ${item.text}：${message}`);
        await prisma.englishContentMedia.update({
          where: {
            id: slot.id
          },
          data: {
            status: "FAILED",
            errorMessage: message
          }
        });
      }
    }

    const pending = await prisma.englishContentMedia.count({
      where: {
        item: {
          unitId: unit.id
        },
        status: {
          not: "READY"
        }
      }
    });
    await prisma.englishContentUnit.update({
      where: {
        id: unit.id
      },
      data: {
        mediaStatus: pending === 0 ? "READY" : "PENDING"
      }
    });

    console.log(`Unit ${unitNumber} ${kind} 登记完成：${registered}/${unit.items.length}`);
    if (failures.length > 0) {
      console.error(failures.join("\n"));
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

function mediaKindArg(argv: string[]): TypingMediaKind {
  const index = argv.indexOf("--kind");
  const value = argv[index + 1]?.trim().toLocaleLowerCase("en-GB");

  if (value === "image") {
    return "ILLUSTRATION";
  }

  if (value === "audio") {
    return "BRITISH_PRONUNCIATION";
  }

  throw new Error("请使用 --kind image 或 --kind audio 指定媒体类型");
}

function integerArg(argv: string[], name: string) {
  const index = argv.indexOf(name);
  const value = index >= 0 ? Number.parseInt(argv[index + 1] ?? "", 10) : Number.NaN;
  return Number.isInteger(value) && value > 0 ? value : null;
}

function stringArg(argv: string[], name: string) {
  const index = argv.indexOf(name);
  const value = index >= 0 ? argv[index + 1]?.trim().toLocaleLowerCase("en-GB") : "";
  return value || null;
}

if (process.argv[1]?.endsWith("register-typing-media.ts")) {
  registerTypingMedia().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "媒体登记失败");
    process.exitCode = 1;
  });
}
