import { resolve } from "node:path";

import { config as loadEnv } from "dotenv";

import { getPrismaClient } from "../src/index.js";
import {
  applyCetTypingLibraryImport,
  buildCetTypingWordlist,
  getCetTypingLibraryConfig,
  type CetExamKey
} from "./cet-typing-wordlist.js";

loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(process.cwd(), "../../.env") });

async function importCetWordlists() {
  const apply = process.argv.slice(2).includes("--apply");
  const requestedExam = optionValue("--exam") ?? "all";
  if (!(["all", "cet4", "cet6"] as const).includes(requestedExam as "all" | CetExamKey)) {
    throw new Error("--exam 只支持 all、cet4 或 cet6");
  }
  const exams: CetExamKey[] = requestedExam === "all"
    ? ["cet4", "cet6"]
    : [requestedExam as CetExamKey];
  const prisma = getPrismaClient();

  try {
    const imports = [];
    for (const exam of exams) {
      const config = getCetTypingLibraryConfig(exam);
      const candidates = await prisma.dictionaryEntry.findMany({
        where: { tag: { contains: config.examTag } },
        select: {
          id: true,
          normalizedWord: true,
          partOfSpeech: true,
          phonetic: true,
          tag: true,
          translation: true,
          word: true
        }
      });
      const plan = buildCetTypingWordlist(candidates, config);
      const totalItems = plan.units.reduce((sum, unit) => sum + unit.items.length, 0);
      imports.push({ config, plan });
      console.log(`${config.title}：${plan.units.length} 个 A-Z 分组，${totalItems} 条词汇，0 条媒体记录`);
      console.log(`分组计数：${plan.units.map((unit) => unit.items.length).join("/")}`);
      console.log(`来源哈希：${plan.sourceHash}`);
    }

    if (!apply) {
      console.log("当前为 dry-run，未写入数据库；确认后添加 --apply。");
      return;
    }

    await prisma.$transaction(async (transaction) => {
      for (const input of imports) {
        await applyCetTypingLibraryImport(transaction, input);
      }
    }, { isolationLevel: "Serializable", maxWait: 30_000, timeout: 300_000 });

    for (const { config } of imports) {
      const library = await prisma.englishContentLibrary.findUniqueOrThrow({
        where: { slug: config.librarySlug },
        select: {
          educationStage: true,
          id: true,
          sourceTextbookId: true,
          _count: { select: { units: true } }
        }
      });
      const [items, media] = await Promise.all([
        prisma.englishContentItem.count({ where: { unit: { libraryId: library.id } } }),
        prisma.englishContentMedia.count({ where: { item: { unit: { libraryId: library.id } } } })
      ]);
      console.log(
        `导入完成：${config.title}，学段 ${library.educationStage}，教材来源 ${library.sourceTextbookId ?? "无"}，${library._count.units} 个分组，${items} 条词汇，${media} 条媒体记录。`
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

function optionValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (process.argv[1]?.endsWith("import-cet-wordlists.ts")) {
  importCetWordlists().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "CET 词库导入失败");
    process.exitCode = 1;
  });
}
