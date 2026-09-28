import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { getPrismaClient, type Prisma } from "../src/index.js";

loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(process.cwd(), "../../.env") });

const ecdictColumns = [
  "word",
  "phonetic",
  "definition",
  "translation",
  "pos",
  "collins",
  "oxford",
  "tag",
  "bnc",
  "frq",
  "exchange",
  "detail",
  "audio"
] as const;

type EcdictColumn = (typeof ecdictColumns)[number];
export type EcdictRecord = Record<EcdictColumn, string>;

const defaultCsvPath = resolve(process.cwd(), "../../data/ecdict/ecdict.csv");
const defaultBatchSize = 1000;

export function normalizeDictionaryWord(value: string) {
  return value.trim().toLowerCase();
}

export function dictionaryInteger(value: string) {
  const normalized = value.trim();

  if (!normalized) {
    return null;
  }

  const parsed = Number.parseInt(normalized, 10);

  return Number.isFinite(parsed) ? parsed : null;
}

export function dictionaryBoolean(value: string) {
  return value.trim() === "1";
}

export function parseEcdictCsvRecord(line: string): EcdictRecord {
  const fields = parseCsvFields(line);

  return ecdictRecordFromFields(fields);
}

export function parseEcdictCsvText(text: string) {
  const parser = createEcdictCsvParser();

  return [...parser.write(text), ...parser.end()];
}

function ecdictRecordFromFields(fields: string[]): EcdictRecord {
  return ecdictColumns.reduce((record, column, index) => {
    record[column] = fields[index]?.trim() ?? "";
    return record;
  }, {} as EcdictRecord);
}

export function toDictionaryEntryCreateInput(record: EcdictRecord): Prisma.DictionaryEntryCreateManyInput | null {
  const word = record.word.trim();

  if (!word) {
    return null;
  }

  return {
    word,
    normalizedWord: normalizeDictionaryWord(word),
    phonetic: nullableText(record.phonetic),
    definition: nullableText(record.definition),
    translation: nullableText(record.translation),
    partOfSpeech: nullableText(record.pos),
    collins: dictionaryInteger(record.collins),
    oxford: dictionaryBoolean(record.oxford),
    tag: nullableText(record.tag),
    bnc: dictionaryInteger(record.bnc),
    frequency: dictionaryInteger(record.frq),
    exchange: nullableText(record.exchange),
    detail: nullableText(record.detail),
    audio: nullableText(record.audio)
  };
}

function nullableText(value: string) {
  const normalized = value.trim();

  return normalized || null;
}

function parseCsvFields(line: string) {
  const fields: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      field += '"';
      index += 1;
      continue;
    }

    if (char === "\\" && quoted && next === '"') {
      field += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === "," && !quoted) {
      fields.push(field);
      field = "";
      continue;
    }

    field += char;
  }

  fields.push(field);

  return fields;
}

function createEcdictCsvParser() {
  const fields: string[] = [];
  let field = "";
  let quoted = false;
  let rowIndex = 0;

  function completeField() {
    fields.push(field);
    field = "";
  }

  function completeRecord(records: EcdictRecord[]) {
    completeField();

    const isBlank = fields.every((value) => !value.trim());
    const isHeader = rowIndex === 0 && fields[0]?.trim() === "word";

    if (!isBlank && !isHeader) {
      records.push(ecdictRecordFromFields(fields));
    }

    fields.length = 0;
    rowIndex += 1;
  }

  function write(input: string) {
    const records: EcdictRecord[] = [];

    for (let index = 0; index < input.length; index += 1) {
      const char = input[index];
      const next = input[index + 1];

      if (quoted) {
        if (char === '"' && next === '"') {
          field += '"';
          index += 1;
          continue;
        }

        if (char === "\\" && next === '"') {
          field += '"';
          index += 1;
          continue;
        }

        if (char === '"') {
          quoted = false;
          continue;
        }

        field += char;
        continue;
      }

      if (char === '"' && field.length === 0) {
        quoted = true;
        continue;
      }

      if (char === ",") {
        completeField();
        continue;
      }

      if (char === "\n") {
        completeRecord(records);
        continue;
      }

      if (char === "\r") {
        if (next === "\n") {
          continue;
        }

        completeRecord(records);
        continue;
      }

      field += char;
    }

    return records;
  }

  function end() {
    const records: EcdictRecord[] = [];

    if (quoted) {
      throw new Error("ECDICT CSV 存在未闭合的引号记录");
    }

    if (field || fields.length > 0) {
      completeRecord(records);
    }

    return records;
  }

  return {
    end,
    write
  };
}

function parseArgs(argv: string[]) {
  const options = {
    source: defaultCsvPath,
    batchSize: defaultBatchSize,
    truncate: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--source" && argv[index + 1]) {
      options.source = resolve(process.cwd(), argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--batch-size" && argv[index + 1]) {
      const batchSize = Number.parseInt(argv[index + 1], 10);
      options.batchSize = Number.isFinite(batchSize) && batchSize > 0 ? batchSize : defaultBatchSize;
      index += 1;
      continue;
    }

    if (arg === "--truncate") {
      options.truncate = true;
    }
  }

  return options;
}

async function importEcdict() {
  const options = parseArgs(process.argv.slice(2));
  const prisma = getPrismaClient();
  const batch: Prisma.DictionaryEntryCreateManyInput[] = [];
  const parser = createEcdictCsvParser();
  let imported = 0;
  let skipped = 0;

  await access(options.source);

  if (options.truncate) {
    await prisma.dictionaryEntry.deleteMany();
  }

  async function flushBatch() {
    if (batch.length === 0) {
      return;
    }

    await prisma.dictionaryEntry.createMany({
      data: batch,
      skipDuplicates: true
    });
    imported += batch.length;
    batch.length = 0;
  }

  for await (const chunk of createReadStream(options.source, "utf8")) {
    for (const record of parser.write(String(chunk))) {
      const input = toDictionaryEntryCreateInput(record);

      if (!input) {
        skipped += 1;
        continue;
      }

      batch.push(input);

      if (batch.length >= options.batchSize) {
        await flushBatch();
      }
    }
  }

  for (const record of parser.end()) {
    const input = toDictionaryEntryCreateInput(record);

    if (input) {
      batch.push(input);
    } else {
      skipped += 1;
    }
  }

  await flushBatch();
  const total = await prisma.dictionaryEntry.count();

  console.log(`ECDICT 导入完成：本次处理 ${imported} 条，跳过 ${skipped} 条，当前词典总量 ${total} 条。`);
  await prisma.$disconnect();
}

if (process.argv[1]?.endsWith("import-ecdict.ts")) {
  importEcdict().catch(async (error: unknown) => {
    console.error(error instanceof Error ? error.message : "ECDICT 导入失败");
    await getPrismaClient().$disconnect().catch(() => {});
    process.exitCode = 1;
  });
}
