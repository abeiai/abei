import { resolve } from "node:path";

import { config as loadEnv } from "dotenv";

import { getPrismaClient, type Prisma } from "../src/index.js";
import {
  parseTypingWordlist,
  type ParsedTypingWordlist
} from "./typing-wordlist-parser.js";
import {
  yilinTypingLibraryConfigs,
  type YilinTypingLibraryConfig
} from "./yilin-typing-library-config.js";

loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(process.cwd(), "../../.env") });

const yilinGrade7AConfig = yilinTypingLibraryConfigs["7a"];

export const yilinGrade7ATextbookSlug = yilinGrade7AConfig.textbookSlug;
export const yilinGrade7ALibrarySlug = yilinGrade7AConfig.librarySlug;
export const yilinGrade7AUnitCounts = [40, 46, 47, 52, 20, 87, 61, 57] as const;

export interface TypingDictionaryCandidate {
  id: string;
  normalizedWord: string;
  partOfSpeech: string | null;
  phonetic: string | null;
}

export function assertTypingWordlistCounts(
  parsed: ParsedTypingWordlist,
  expectedCounts: readonly number[]
) {
  const actualCounts = parsed.units.map((unit) => unit.items.length);
  const unitNumbers = parsed.units.map((unit) => unit.number);
  const expectedUnitNumbers = expectedCounts.map((_, index) => index + 1);

  if (
    actualCounts.length !== expectedCounts.length
    || actualCounts.some((count, index) => count !== expectedCounts[index])
    || unitNumbers.some((number, index) => number !== expectedUnitNumbers[index])
  ) {
    throw new Error(
      `词汇数量与已复核教材不一致：期望 ${expectedCounts.join("/")}，实际 ${actualCounts.join("/") || "无"}`
    );
  }
}

export function assertYilinGrade7AWordlistCounts(parsed: ParsedTypingWordlist) {
  assertTypingWordlistCounts(parsed, yilinGrade7AUnitCounts);
}

export function buildTypingWordlistImportPlan(
  parsed: ParsedTypingWordlist,
  dictionaryEntries: TypingDictionaryCandidate[],
  options: {
    includeAudio?: boolean;
    includeIllustration?: boolean;
  } = {}
) {
  const dictionaryByWord = new Map<string, TypingDictionaryCandidate[]>();

  for (const entry of dictionaryEntries) {
    const entries = dictionaryByWord.get(entry.normalizedWord) ?? [];
    entries.push(entry);
    dictionaryByWord.set(entry.normalizedWord, entries);
  }

  return {
    sourceHash: parsed.sourceHash,
    units: parsed.units.map((unit) => ({
      ...unit,
      items: unit.items.map((item) => {
        const dictionaryMatches = item.itemType === "WORD"
          ? dictionaryByWord.get(item.normalizedText) ?? []
          : [];
        const dictionaryEntry = dictionaryMatches.length === 1 ? dictionaryMatches[0] : null;

        return {
          ...item,
          britishPhonetic: dictionaryEntry?.phonetic?.trim() || item.britishPhonetic,
          dictionaryEntryId: dictionaryEntry?.id ?? null,
          acceptedAnswers: [
            {
              answer: item.text,
              isPrimary: true,
              normalizedAnswer: item.normalizedText,
              sortOrder: 0
            }
          ],
          media: [
            ...(options.includeIllustration === false ? [] : [{
              generatorModel: "built-in",
              generatorProvider: "openai-imagegen",
              kind: "ILLUSTRATION" as const,
              status: "PENDING" as const,
              voice: null
            }]),
            ...(options.includeAudio === false ? [] : [{
              generatorModel: "cosyvoice-v3-flash",
              generatorProvider: "aliyun-dashscope",
              kind: "BRITISH_PRONUNCIATION" as const,
              status: "PENDING" as const,
              voice: "loongemily_v3"
            }])
          ]
        };
      })
    }))
  };
}

async function importYilinGrade7AWordlist() {
  const apply = process.argv.slice(2).includes("--apply");
  const prisma = getPrismaClient();

  try {
    const textbook = await prisma.learningMaterialTextbook.findUnique({
      where: {
        slug: yilinGrade7ATextbookSlug
      },
      select: {
        id: true,
        markdownContent: true,
        title: true
      }
    });

    if (!textbook?.markdownContent) {
      throw new Error("未找到译林版七年级上册教材 Markdown");
    }

    const parsed = parseTypingWordlist(textbook.markdownContent);
    assertYilinGrade7AWordlistCounts(parsed);
    const normalizedWords = [...new Set(
      parsed.units.flatMap((unit) => unit.items)
        .filter((item) => item.itemType === "WORD")
        .map((item) => item.normalizedText)
    )];
    const dictionaryEntries = await prisma.dictionaryEntry.findMany({
      where: {
        normalizedWord: {
          in: normalizedWords
        }
      },
      select: {
        id: true,
        normalizedWord: true,
        partOfSpeech: true,
        phonetic: true
      }
    });
    const plan = buildTypingWordlistImportPlan(parsed, dictionaryEntries);
    const total = plan.units.reduce((sum, unit) => sum + unit.items.length, 0);
    const dictionaryMatches = plan.units.reduce(
      (sum, unit) => sum + unit.items.filter((item) => item.dictionaryEntryId).length,
      0
    );

    console.log(`教材：${textbook.title}`);
    console.log(`单元：${plan.units.length}；词条：${total}；唯一词典匹配：${dictionaryMatches}`);
    console.log(`单元计数：${plan.units.map((unit) => unit.items.length).join("/")}`);
    console.log(`来源哈希：${plan.sourceHash}`);

    if (!apply) {
      console.log("当前为 dry-run，未写入数据库；添加 --apply 后执行导入。");
      return;
    }

    await prisma.$transaction(
      async (transaction) => applyTypingWordlistImportPlan(transaction, {
        library: yilinGrade7AConfig,
        plan,
        textbookId: textbook.id
      }),
      {
        timeout: 60_000
      }
    );

    const library = await prisma.englishContentLibrary.findUniqueOrThrow({
      where: {
        slug: yilinGrade7ALibrarySlug
      },
      select: {
        id: true,
        _count: {
          select: {
            units: true
          }
        }
      }
    });
    const itemCount = await prisma.englishContentItem.count({
      where: {
        unit: {
          libraryId: library.id
        }
      }
    });

    console.log(`导入完成：内容库 ${library.id}，${library._count.units} 个单元，${itemCount} 条词汇。`);
  } finally {
    await prisma.$disconnect();
  }
}

export async function applyTypingWordlistImportPlan(
  transaction: Prisma.TransactionClient,
  input: {
    library: Pick<
      YilinTypingLibraryConfig,
      "description" | "librarySlug" | "sortOrder" | "title"
    >;
    plan: ReturnType<typeof buildTypingWordlistImportPlan>;
    textbookId: string;
  }
) {
  const library = await transaction.englishContentLibrary.upsert({
    where: {
      slug: input.library.librarySlug
    },
    create: {
      slug: input.library.librarySlug,
      title: input.library.title,
      description: input.library.description,
      libraryType: "WORDLIST",
      language: "en-GB",
      sourceTextbookId: input.textbookId,
      sourceHash: input.plan.sourceHash,
      status: "PUBLISHED",
      sortOrder: input.library.sortOrder
    },
    update: {
      title: input.library.title,
      description: input.library.description,
      sourceTextbookId: input.textbookId,
      sourceHash: input.plan.sourceHash,
      status: "PUBLISHED",
      sortOrder: input.library.sortOrder
    }
  });

  for (const unit of input.plan.units) {
    const unitRecord = await transaction.englishContentUnit.upsert({
      where: {
        libraryId_code: {
          libraryId: library.id,
          code: unit.code
        }
      },
      create: {
        libraryId: library.id,
        code: unit.code,
        title: unit.title,
        sourcePageStart: unit.sourcePageStart,
        sourcePageEnd: unit.sourcePageEnd,
        status: "PUBLISHED",
        mediaStatus: "PENDING",
        sortOrder: unit.number
      },
      update: {
        title: unit.title,
        sourcePageStart: unit.sourcePageStart,
        sourcePageEnd: unit.sourcePageEnd,
        status: "PUBLISHED",
        sortOrder: unit.number
      }
    });

    for (const item of unit.items) {
      const itemRecord = await transaction.englishContentItem.upsert({
        where: {
          unitId_sourceOrder: {
            unitId: unitRecord.id,
            sourceOrder: item.sourceOrder
          }
        },
        create: {
          unitId: unitRecord.id,
          dictionaryEntryId: item.dictionaryEntryId,
          text: item.text,
          normalizedText: item.normalizedText,
          itemType: item.itemType,
          translation: item.translation,
          britishPhonetic: item.britishPhonetic,
          partOfSpeech: item.partOfSpeech,
          isSpellingRequired: item.isSpellingRequired,
          sourceOrder: item.sourceOrder,
          sourcePage: item.sourcePage,
          sourceRaw: item.sourceRaw,
          reviewStatus: "VERIFIED"
        },
        update: {
          dictionaryEntryId: item.dictionaryEntryId,
          text: item.text,
          normalizedText: item.normalizedText,
          itemType: item.itemType,
          translation: item.translation,
          britishPhonetic: item.britishPhonetic,
          partOfSpeech: item.partOfSpeech,
          isSpellingRequired: item.isSpellingRequired,
          sourcePage: item.sourcePage,
          sourceRaw: item.sourceRaw,
          reviewStatus: "VERIFIED"
        }
      });

      for (const acceptedAnswer of item.acceptedAnswers) {
        await transaction.englishContentAcceptedAnswer.upsert({
          where: {
            itemId_normalizedAnswer: {
              itemId: itemRecord.id,
              normalizedAnswer: acceptedAnswer.normalizedAnswer
            }
          },
          create: {
            itemId: itemRecord.id,
            ...acceptedAnswer
          },
          update: {
            answer: acceptedAnswer.answer,
            isPrimary: acceptedAnswer.isPrimary,
            sortOrder: acceptedAnswer.sortOrder
          }
        });
      }

      for (const media of item.media) {
        await transaction.englishContentMedia.upsert({
          where: {
            itemId_kind: {
              itemId: itemRecord.id,
              kind: media.kind
            }
          },
          create: {
            itemId: itemRecord.id,
            kind: media.kind,
            status: media.status,
            generatorProvider: media.generatorProvider,
            generatorModel: media.generatorModel,
            voice: media.voice
          },
          update: {
            generatorProvider: media.generatorProvider,
            generatorModel: media.generatorModel,
            voice: media.voice
          }
        });
      }
    }
  }
}

if (process.argv[1]?.endsWith("import-typing-wordlist.ts")) {
  importYilinGrade7AWordlist().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "译林版词汇导入失败");
    process.exitCode = 1;
  });
}
