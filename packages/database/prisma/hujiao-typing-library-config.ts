export type HujiaoTypingBookKey =
  | "3a" | "3b" | "4a" | "4b" | "5a" | "5b" | "6a" | "6b"
  | "7a" | "7b" | "8a" | "8b" | "9a" | "9b"
  | "54-6a" | "54-6b" | "54-7a" | "54-7b"
  | "b1" | "b2" | "b3" | "xb1" | "xb2" | "xb3" | "xb4";

export type HujiaoTypingParserKind =
  | "PRIMARY_DIRECT"
  | "PRIMARY_INDEXED"
  | "ALPHABETICAL_PAGE"
  | "UNIT_PAGE"
  | "SENIOR_DEFINITION";

export interface HujiaoTypingLibraryConfig {
  assetKey: string;
  description: string;
  expectedUnitCounts: readonly number[];
  key: HujiaoTypingBookKey;
  librarySlug: string;
  parserKind: HujiaoTypingParserKind;
  sortOrder: number;
  textbookSlug: string;
  title: string;
  unitStartPages: readonly number[];
}

function config(input: Omit<HujiaoTypingLibraryConfig, "assetKey" | "description">): HujiaoTypingLibraryConfig {
  return {
    ...input,
    assetKey: `hj-${input.key}`,
    description: "从沪教版电子教材 Markdown 词表提取、校验并按单元归档的平台公共打字记词内容库"
  };
}

export const hujiaoTypingLibraryConfigs: Record<HujiaoTypingBookKey, HujiaoTypingLibraryConfig> = {
  "3a": config({ key: "3a", title: "沪教版英语三年级上册词汇", librarySlug: "hujiao-english-grade-3-first-volume-wordlist", textbookSlug: "smartedu-0b7d570b-33a2-3c5d-2cab-00c3ddb65e57", parserKind: "PRIMARY_DIRECT", expectedUnitCounts: [26, 18, 19, 17, 17, 16, 16, 17], unitStartPages: [], sortOrder: 20 }),
  "3b": config({ key: "3b", title: "沪教版英语三年级下册词汇", librarySlug: "hujiao-english-grade-3-second-volume-wordlist", textbookSlug: "smartedu-d523d9fc-abf2-48a3-94e6-6d9a25fae4af", parserKind: "PRIMARY_DIRECT", expectedUnitCounts: [19, 13, 20, 23, 25, 21, 20, 15], unitStartPages: [], sortOrder: 21 }),
  "4a": config({ key: "4a", title: "沪教版英语四年级上册词汇", librarySlug: "hujiao-english-grade-4-first-volume-wordlist", textbookSlug: "smartedu-6c6edb6c-60ca-4c29-82df-a2357f087f60", parserKind: "PRIMARY_INDEXED", expectedUnitCounts: [11, 10, 11, 12, 12, 12, 18, 14, 14, 14, 11, 10], unitStartPages: [], sortOrder: 22 }),
  "4b": config({ key: "4b", title: "沪教版英语四年级下册词汇", librarySlug: "hujiao-english-grade-4-second-volume-wordlist", textbookSlug: "smartedu-0f2a0c94-50c1-4b7a-8211-8ff18da1d475", parserKind: "PRIMARY_INDEXED", expectedUnitCounts: [9, 15, 15, 15, 16, 11, 18, 14, 20, 8, 8, 11], unitStartPages: [], sortOrder: 23 }),
  "5a": config({ key: "5a", title: "沪教版英语五年级上册词汇", librarySlug: "hujiao-english-grade-5-first-volume-wordlist", textbookSlug: "smartedu-e97bf778-237b-4c23-b71d-6f7b80078f66", parserKind: "PRIMARY_INDEXED", expectedUnitCounts: [13, 17, 13, 10, 21, 16, 13, 13, 16, 16, 16, 14], unitStartPages: [], sortOrder: 24 }),
  "5b": config({ key: "5b", title: "沪教版英语五年级下册词汇", librarySlug: "hujiao-english-grade-5-second-volume-wordlist", textbookSlug: "smartedu-70085bc7-91aa-4726-9f92-8eed80d30276", parserKind: "PRIMARY_INDEXED", expectedUnitCounts: [19, 15, 16, 14, 14, 10, 9, 18, 24, 9, 14, 7], unitStartPages: [], sortOrder: 25 }),
  "6a": config({ key: "6a", title: "沪教版英语六年级上册词汇", librarySlug: "hujiao-english-grade-6-first-volume-wordlist", textbookSlug: "smartedu-b25139ad-009e-4537-afe7-f393a5e43ef1", parserKind: "PRIMARY_INDEXED", expectedUnitCounts: [9, 5, 12, 6, 15, 9, 14, 12, 11, 9, 8, 11], unitStartPages: [], sortOrder: 26 }),
  "6b": config({ key: "6b", title: "沪教版英语六年级下册词汇", librarySlug: "hujiao-english-grade-6-second-volume-wordlist", textbookSlug: "smartedu-63f19462-c7e5-43cb-a5db-756341614929", parserKind: "PRIMARY_INDEXED", expectedUnitCounts: [12, 17, 11, 16, 17, 12, 8, 16, 13, 10, 7, 13], unitStartPages: [], sortOrder: 27 }),
  "7a": config({ key: "7a", title: "沪教版英语七年级上册词汇", librarySlug: "hujiao-english-grade-7-first-volume-wordlist", textbookSlug: "smartedu-454dfc04-1259-20fe-cfa2-108408618de7", parserKind: "ALPHABETICAL_PAGE", expectedUnitCounts: [44, 42, 38, 49, 41, 39, 37, 41], unitStartPages: [4, 20, 36, 52, 68, 85, 100, 116], sortOrder: 28 }),
  "7b": config({ key: "7b", title: "沪教版英语七年级下册词汇", librarySlug: "hujiao-english-grade-7-second-volume-wordlist", textbookSlug: "smartedu-13f39e27-05a6-4f55-aa35-09b29500b015", parserKind: "ALPHABETICAL_PAGE", expectedUnitCounts: [34, 43, 36, 35, 35, 31, 48, 34], unitStartPages: [4, 20, 36, 52, 68, 84, 100, 116], sortOrder: 29 }),
  "8a": config({ key: "8a", title: "沪教版英语八年级上册词汇", librarySlug: "hujiao-english-grade-8-first-volume-wordlist", textbookSlug: "smartedu-01fb75fc-776a-43cc-a974-b03d61679125", parserKind: "ALPHABETICAL_PAGE", expectedUnitCounts: [28, 27, 29, 30, 24, 37, 25, 29], unitStartPages: [1, 17, 33, 49, 65, 81, 97, 113], sortOrder: 30 }),
  "8b": config({ key: "8b", title: "沪教版英语八年级下册词汇", librarySlug: "hujiao-english-grade-8-second-volume-wordlist", textbookSlug: "smartedu-d9587713-66bd-4f85-806f-cc2fa5619cd3", parserKind: "ALPHABETICAL_PAGE", expectedUnitCounts: [27, 31, 34, 37, 27, 34, 35, 30], unitStartPages: [1, 17, 33, 49, 65, 81, 97, 113], sortOrder: 31 }),
  "9a": config({ key: "9a", title: "沪教版英语九年级上册词汇", librarySlug: "hujiao-english-grade-9-first-volume-wordlist", textbookSlug: "smartedu-b1a19b7a-5a7f-4d0e-9f9d-b5e59dafc979", parserKind: "ALPHABETICAL_PAGE", expectedUnitCounts: [31, 36, 24, 31, 29, 39, 36, 27], unitStartPages: [1, 17, 34, 51, 65, 81, 97, 113], sortOrder: 32 }),
  "9b": config({ key: "9b", title: "沪教版英语九年级下册词汇", librarySlug: "hujiao-english-grade-9-second-volume-wordlist", textbookSlug: "smartedu-8a9962e7-f8e6-4f5f-8e2a-df9bf874bf0c", parserKind: "ALPHABETICAL_PAGE", expectedUnitCounts: [32, 31, 33, 32, 29, 32], unitStartPages: [1, 17, 33, 49, 65, 81], sortOrder: 33 }),
  "54-6a": config({ key: "54-6a", title: "沪教版英语六年级上册词汇（五四学制）", librarySlug: "hujiao-five-four-english-grade-6-first-volume-wordlist", textbookSlug: "smartedu-ffaef417-5682-af96-b998-b125cb43f15e", parserKind: "UNIT_PAGE", expectedUnitCounts: [39, 47, 51, 60, 43, 46], unitStartPages: [12, 26, 42, 56, 70, 82], sortOrder: 34 }),
  "54-6b": config({ key: "54-6b", title: "沪教版英语六年级下册词汇（五四学制）", librarySlug: "hujiao-five-four-english-grade-6-second-volume-wordlist", textbookSlug: "smartedu-935fb9e6-a448-74ad-eb25-e7022ddfc6d5", parserKind: "UNIT_PAGE", expectedUnitCounts: [53, 36, 48, 50, 39, 48], unitStartPages: [2, 16, 30, 46, 60, 74], sortOrder: 35 }),
  "54-7a": config({ key: "54-7a", title: "沪教版英语七年级上册词汇（五四学制）", librarySlug: "hujiao-five-four-english-grade-7-first-volume-wordlist", textbookSlug: "smartedu-91490de6-2a1d-308e-2950-e485446c69ef", parserKind: "UNIT_PAGE", expectedUnitCounts: [42, 48, 56, 40, 42, 35], unitStartPages: [14, 30, 46, 62, 78, 94], sortOrder: 36 }),
  "54-7b": config({ key: "54-7b", title: "沪教版英语七年级下册词汇（五四学制）", librarySlug: "hujiao-five-four-english-grade-7-second-volume-wordlist", textbookSlug: "smartedu-13b0253e-5825-943b-007c-3110422ee884", parserKind: "UNIT_PAGE", expectedUnitCounts: [47, 60, 41, 47, 53, 35], unitStartPages: [4, 20, 36, 52, 68, 84], sortOrder: 37 }),
  "b1": config({ key: "b1", title: "沪教版高中英语必修第一册词汇", librarySlug: "hujiao-senior-english-compulsory-volume-1-wordlist", textbookSlug: "smartedu-307302c5-ca49-4be1-9b45-6ffe702c3cc5", parserKind: "SENIOR_DEFINITION", expectedUnitCounts: [61, 54, 57, 54], unitStartPages: [], sortOrder: 38 }),
  "b2": config({ key: "b2", title: "沪教版高中英语必修第二册词汇", librarySlug: "hujiao-senior-english-compulsory-volume-2-wordlist", textbookSlug: "smartedu-3d4ef8c1-f511-4723-9358-db926373495c", parserKind: "SENIOR_DEFINITION", expectedUnitCounts: [53, 62, 56, 42], unitStartPages: [], sortOrder: 39 }),
  "b3": config({ key: "b3", title: "沪教版高中英语必修第三册词汇", librarySlug: "hujiao-senior-english-compulsory-volume-3-wordlist", textbookSlug: "smartedu-e5a7d2a5-12fa-425a-87e0-2678ea9bbe33", parserKind: "SENIOR_DEFINITION", expectedUnitCounts: [63, 52, 52, 59], unitStartPages: [], sortOrder: 40 }),
  "xb1": config({ key: "xb1", title: "沪教版高中英语选择性必修第一册词汇", librarySlug: "hujiao-senior-english-selective-compulsory-volume-1-wordlist", textbookSlug: "smartedu-a7e5c3d3-10f3-43b9-af25-40866cfe2eca", parserKind: "SENIOR_DEFINITION", expectedUnitCounts: [65, 73, 67, 70], unitStartPages: [], sortOrder: 41 }),
  "xb2": config({ key: "xb2", title: "沪教版高中英语选择性必修第二册词汇", librarySlug: "hujiao-senior-english-selective-compulsory-volume-2-wordlist", textbookSlug: "smartedu-fbd6f377-5c21-4ff4-905a-90e3fdddfe3b", parserKind: "SENIOR_DEFINITION", expectedUnitCounts: [68, 66, 58, 62], unitStartPages: [], sortOrder: 42 }),
  "xb3": config({ key: "xb3", title: "沪教版高中英语选择性必修第三册词汇", librarySlug: "hujiao-senior-english-selective-compulsory-volume-3-wordlist", textbookSlug: "smartedu-601a9768-27ca-4630-9d33-ecb1abd7977e", parserKind: "SENIOR_DEFINITION", expectedUnitCounts: [64, 68, 56, 55], unitStartPages: [], sortOrder: 43 }),
  "xb4": config({ key: "xb4", title: "沪教版高中英语选择性必修第四册词汇", librarySlug: "hujiao-senior-english-selective-compulsory-volume-4-wordlist", textbookSlug: "smartedu-9b69b588-9343-48b5-91de-1bb5a89afd9d", parserKind: "SENIOR_DEFINITION", expectedUnitCounts: [52, 53, 67, 50], unitStartPages: [], sortOrder: 44 })
};

export const hujiaoTypingBookKeys = Object.keys(hujiaoTypingLibraryConfigs) as HujiaoTypingBookKey[];

export function getHujiaoTypingLibraryConfig(key: string) {
  if (!(key in hujiaoTypingLibraryConfigs)) {
    throw new Error(`不支持的沪教版教材编号：${key}`);
  }
  return hujiaoTypingLibraryConfigs[key as HujiaoTypingBookKey];
}
