export type PepTypingBookKey = "3a" | "3b" | "4a" | "4b" | "5a" | "5b" | "6a" | "6b";

export interface PepTypingLibraryConfig {
  assetKey: string;
  description: string;
  expectedUnitCounts: readonly number[];
  key: PepTypingBookKey;
  librarySlug: string;
  sortOrder: number;
  textbookSlug: string;
  title: string;
  unitStartPages: readonly number[];
}

function config(
  input: Omit<PepTypingLibraryConfig, "assetKey" | "description">
): PepTypingLibraryConfig {
  return {
    ...input,
    assetKey: `pep-${input.key}`,
    description: "从人教版（PEP）电子教材 Markdown 单元词汇表提取、校验并按单元归档的平台公共打字记词内容库"
  };
}

export const pepTypingLibraryConfigs: Record<PepTypingBookKey, PepTypingLibraryConfig> = {
  "3a": config({ key: "3a", title: "人教版（PEP）英语三年级上册词汇", librarySlug: "pep-english-grade-3-first-volume-wordlist", textbookSlug: "smartedu-485d2118-1652-ea90-8da7-5b9eaeb71dc4", expectedUnitCounts: [18, 20, 22, 19, 16, 16], unitStartPages: [4, 16, 28, 40, 52, 64], sortOrder: 45 }),
  "3b": config({ key: "3b", title: "人教版（PEP）英语三年级下册词汇", librarySlug: "pep-english-grade-3-second-volume-wordlist", textbookSlug: "smartedu-10b11234-3b0a-4b3e-b4b4-db3013774529", expectedUnitCounts: [11, 24, 20, 17, 17, 13], unitStartPages: [4, 16, 28, 40, 52, 64], sortOrder: 46 }),
  "4a": config({ key: "4a", title: "人教版（PEP）英语四年级上册词汇", librarySlug: "pep-english-grade-4-first-volume-wordlist", textbookSlug: "smartedu-02736c70-9509-438f-8e16-2902feaf5ed8", expectedUnitCounts: [15, 13, 11, 12, 15, 17], unitStartPages: [4, 14, 24, 38, 48, 58], sortOrder: 47 }),
  "4b": config({ key: "4b", title: "人教版（PEP）英语四年级下册词汇", librarySlug: "pep-english-grade-4-second-volume-wordlist", textbookSlug: "smartedu-18b54350-f833-4b5c-a1b9-ebbf02cf4545", expectedUnitCounts: [13, 20, 22, 16, 16, 19], unitStartPages: [4, 14, 24, 38, 48, 58], sortOrder: 48 }),
  "5a": config({ key: "5a", title: "人教版（PEP）英语五年级上册词汇", librarySlug: "pep-english-grade-5-first-volume-wordlist", textbookSlug: "smartedu-9f1cda77-2dc7-442b-82f1-97243f7ec39d", expectedUnitCounts: [19, 28, 16, 27, 24, 15], unitStartPages: [4, 14, 24, 38, 48, 58], sortOrder: 49 }),
  "5b": config({ key: "5b", title: "人教版（PEP）英语五年级下册词汇", librarySlug: "pep-english-grade-5-second-volume-wordlist", textbookSlug: "smartedu-c5180299-d288-46e2-a0df-9f04c94fd922", expectedUnitCounts: [36, 24, 35, 21, 16, 24], unitStartPages: [4, 14, 24, 38, 48, 58], sortOrder: 50 }),
  "6a": config({ key: "6a", title: "人教版（PEP）英语六年级上册词汇", librarySlug: "pep-english-grade-6-first-volume-wordlist", textbookSlug: "smartedu-9e2878bf-964d-47fb-85ba-937cf61159a5", expectedUnitCounts: [25, 29, 27, 14, 21, 31], unitStartPages: [4, 14, 24, 38, 48, 58], sortOrder: 51 }),
  "6b": config({ key: "6b", title: "人教版（PEP）英语六年级下册词汇", librarySlug: "pep-english-grade-6-second-volume-wordlist", textbookSlug: "smartedu-1417c7bc-52d9-4c4d-92fd-796a92a6d275", expectedUnitCounts: [21, 24, 23, 22], unitStartPages: [4, 14, 24, 34], sortOrder: 52 })
};

export const pepTypingBookKeys = Object.keys(pepTypingLibraryConfigs) as PepTypingBookKey[];

export function getPepTypingLibraryConfig(key: string) {
  if (!(key in pepTypingLibraryConfigs)) {
    throw new Error(`不支持的人教版（PEP）教材编号：${key}`);
  }
  return pepTypingLibraryConfigs[key as PepTypingBookKey];
}
