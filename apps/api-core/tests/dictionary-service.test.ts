import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ??= "postgresql://xueleai:xueleai_dev_password@localhost:3324/xueleai?schema=public";

test("dictionary module can bootstrap without explicit dictionary client provider", async () => {
  const { NestFactory } = await import("@nestjs/core");
  const { DictionaryModule } = await import("../src/dictionary/dictionary.module.js");

  const app = await NestFactory.createApplicationContext(DictionaryModule, {
    logger: false
  });

  await app.close();
});

test("dictionary service returns exact match with suggestions and exchange labels", async () => {
  const { DictionaryService } = await import("../src/dictionary/dictionary.service.js");
  const calls: string[] = [];
  const expectedOrderBy = [
    { collins: { sort: "desc", nulls: "last" } },
    { frequency: { sort: "asc", nulls: "last" } },
    { bnc: { sort: "asc", nulls: "last" } },
    { word: "asc" }
  ];
  const service = new DictionaryService({
    dictionaryEntry: {
      count: async () => 2,
      findFirst: async ({ orderBy, where }: { orderBy: unknown; where: { normalizedWord: string } }) => {
        assert.deepEqual(orderBy, expectedOrderBy);
        calls.push(`findFirst:${where.normalizedWord}`);
        return {
          id: "entry-test",
          word: "test",
          normalizedWord: "test",
          phonetic: "test",
          definition: "n. a procedure intended to establish quality",
          translation: "n. 测验; 检查\\nv. 测试",
          partOfSpeech: "n/v",
          collins: 5,
          oxford: true,
          tag: "zk gk",
          bnc: 120,
          frequency: 234,
          exchange: "p:tested/i:testing/3:tests",
          detail: null,
          audio: null,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z")
        };
      },
      findMany: async ({
        orderBy,
        where,
        take
      }: {
        orderBy: unknown;
        where: { normalizedWord: { startsWith: string } };
        take: number;
      }) => {
        assert.deepEqual(orderBy, expectedOrderBy);
        calls.push(`findMany:${where.normalizedWord.startsWith}:${take}`);
        return [
          {
            id: "entry-test",
            word: "test",
            normalizedWord: "test",
            phonetic: "test",
            definition: "n. a procedure intended to establish quality",
            translation: "n. 测验; 检查\\nv. 测试",
            partOfSpeech: "n/v",
            collins: 5,
            oxford: true,
            tag: "zk gk",
            bnc: 120,
            frequency: 234,
            exchange: "p:tested/i:testing/3:tests",
            detail: null,
            audio: null,
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            updatedAt: new Date("2026-01-01T00:00:00.000Z")
          }
        ];
      }
    }
  } as never);

  const result = await service.search({ q: " Test ", limit: "5" });

  assert.deepEqual(calls, ["findFirst:test", "findMany:test:5"]);
  assert.equal(result.query, "Test");
  assert.equal(result.totalEntries, 2);
  assert.equal(result.exact?.word, "test");
  assert.equal(result.suggestions.length, 1);
  assert.deepEqual(result.exact?.translationLines, ["n. 测验; 检查", "v. 测试"]);
  assert.deepEqual(result.exact?.exchanges, [
    { label: "过去式", value: "tested" },
    { label: "现在分词", value: "testing" },
    { label: "第三人称单数", value: "tests" }
  ]);
});

test("dictionary service searches English entries by Chinese translation", async () => {
  const { DictionaryService } = await import("../src/dictionary/dictionary.service.js");
  const expectedOrderBy = [
    { collins: { sort: "desc", nulls: "last" } },
    { frequency: { sort: "asc", nulls: "last" } },
    { bnc: { sort: "asc", nulls: "last" } },
    { word: "asc" }
  ];
  const service = new DictionaryService({
    dictionaryEntry: {
      count: async () => 770611,
      findFirst: async () => {
        throw new Error("中文释义反查不应执行英文精确匹配");
      },
      findMany: async ({
        orderBy,
        where,
        take
      }: {
        orderBy: unknown;
        where: { translation: { contains: string } };
        take: number;
      }) => {
        assert.deepEqual(orderBy, expectedOrderBy);
        assert.equal(where.translation.contains, "学习");
        assert.equal(take, 2);

        return [
          {
            id: "entry-study",
            word: "study",
            normalizedWord: "study",
            phonetic: "stʌdi",
            definition: "v. learn about a subject",
            translation: "n. 学习; 研究\\nv. 学习; 研究",
            partOfSpeech: "n/v",
            collins: 4,
            oxford: true,
            tag: "zk gk",
            bnc: 300,
            frequency: 210,
            exchange: "p:studied/i:studying/3:studies",
            detail: null,
            audio: null,
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            updatedAt: new Date("2026-01-01T00:00:00.000Z")
          }
        ];
      }
    }
  } as never);

  const result = await service.search({ q: "学习", limit: "2" });

  assert.equal(result.query, "学习");
  assert.equal(result.normalizedQuery, "学习");
  assert.equal(result.queryMode, "translation");
  assert.equal(result.exact, null);
  assert.equal(result.suggestions.length, 1);
  assert.equal(result.suggestions[0]?.word, "study");
  assert.deepEqual(result.suggestions[0]?.translationLines, ["n. 学习; 研究", "v. 学习; 研究"]);
});

test("dictionary service rejects empty search query", async () => {
  const { DictionaryService } = await import("../src/dictionary/dictionary.service.js");
  const service = new DictionaryService({
    dictionaryEntry: {
      count: async () => 0,
      findFirst: async () => null,
      findMany: async () => []
    }
  } as never);

  await assert.rejects(() => service.search({ q: " " }), /请输入要查询的英文单词或中文释义/);
});
