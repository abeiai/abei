export type YilinTypingBookKey =
  | "3a" | "3b" | "4a" | "4b" | "5a" | "5b" | "6a" | "6b"
  | "7a" | "7b" | "8a" | "8b" | "9a" | "9b"
  | "b1" | "b2" | "b3" | "xb1" | "xb2" | "xb3" | "xb4";

export interface YilinTypingLibraryConfig {
  assetKey: string;
  description: string;
  expectedUnitCounts: readonly number[];
  key: YilinTypingBookKey;
  librarySlug: string;
  sortOrder: number;
  textbookSlug: string;
  title: string;
  unitStartPages: readonly number[];
}

export const yilinTypingLibraryConfigs: Record<YilinTypingBookKey, YilinTypingLibraryConfig> = {
  "3a": {
    assetKey: "yl-3a",
    description: "从电子教材词表提取并按首次出现页码归入单元的平台公共打字记词内容库",
    expectedUnitCounts: [13, 10, 17, 9, 18, 12, 31, 18],
    key: "3a",
    librarySlug: "yilin-english-grade-3-first-volume-wordlist",
    sortOrder: -8,
    textbookSlug: "smartedu-1206a3aa-1969-9e64-b354-e6eae4325ed4",
    title: "译林版英语三年级上册词汇",
    unitStartPages: [8, 16, 24, 32, 42, 50, 58, 66]
  },
  "3b": {
    assetKey: "yl-3b",
    description: "从电子教材按单元词表提取的平台公共打字记词内容库",
    expectedUnitCounts: [14, 17, 19, 27, 16, 14, 14, 17],
    key: "3b",
    librarySlug: "yilin-english-grade-3-second-volume-wordlist",
    sortOrder: -7,
    textbookSlug: "smartedu-d87e8865-615a-4b3b-8d34-179b9fb33013",
    title: "译林版英语三年级下册词汇",
    unitStartPages: []
  },
  "4a": {
    assetKey: "yl-4a",
    description: "从电子教材按单元词表提取的平台公共打字记词内容库",
    expectedUnitCounts: [13, 15, 18, 14, 14, 17, 17, 12],
    key: "4a",
    librarySlug: "yilin-english-grade-4-first-volume-wordlist",
    sortOrder: -6,
    textbookSlug: "smartedu-a9ce6662-f5a5-4561-944a-c3dbcc5a8192",
    title: "译林版英语四年级上册词汇",
    unitStartPages: []
  },
  "4b": {
    assetKey: "yl-4b",
    description: "从电子教材按单元词表提取的平台公共打字记词内容库",
    expectedUnitCounts: [17, 17, 13, 14, 19, 17, 9, 13],
    key: "4b",
    librarySlug: "yilin-english-grade-4-second-volume-wordlist",
    sortOrder: -5,
    textbookSlug: "smartedu-a4fb0c8b-ebd6-4db9-bca0-705fca8126e4",
    title: "译林版英语四年级下册词汇",
    unitStartPages: []
  },
  "5a": {
    assetKey: "yl-5a",
    description: "从电子教材按单元词表提取的平台公共打字记词内容库",
    expectedUnitCounts: [20, 14, 11, 19, 17, 21, 15, 31],
    key: "5a",
    librarySlug: "yilin-english-grade-5-first-volume-wordlist",
    sortOrder: -4,
    textbookSlug: "smartedu-06631d69-0865-4694-baf9-dccf22bff2fd",
    title: "译林版英语五年级上册词汇",
    unitStartPages: []
  },
  "5b": {
    assetKey: "yl-5b",
    description: "从电子教材按单元词表提取的平台公共打字记词内容库",
    expectedUnitCounts: [26, 10, 26, 15, 14, 27, 17, 18],
    key: "5b",
    librarySlug: "yilin-english-grade-5-second-volume-wordlist",
    sortOrder: -3,
    textbookSlug: "smartedu-d3324da8-fe96-4a0d-9259-e60794e27491",
    title: "译林版英语五年级下册词汇",
    unitStartPages: []
  },
  "6a": {
    assetKey: "yl-6a",
    description: "从电子教材按单元词表提取的平台公共打字记词内容库",
    expectedUnitCounts: [21, 24, 18, 24, 22, 19, 23, 15],
    key: "6a",
    librarySlug: "yilin-english-grade-6-first-volume-wordlist",
    sortOrder: -2,
    textbookSlug: "smartedu-32d2e60a-be5a-4c1c-92d6-8b99e00f6db3",
    title: "译林版英语六年级上册词汇",
    unitStartPages: []
  },
  "6b": {
    assetKey: "yl-6b",
    description: "从电子教材按单元词表提取的平台公共打字记词内容库",
    expectedUnitCounts: [25, 13, 7, 14, 7, 23, 13, 16],
    key: "6b",
    librarySlug: "yilin-english-grade-6-second-volume-wordlist",
    sortOrder: -1,
    textbookSlug: "smartedu-2b63b996-3f8c-439a-bb0c-3f127c9507af",
    title: "译林版英语六年级下册词汇",
    unitStartPages: []
  },
  "7a": {
    assetKey: "yl-7a",
    description: "从电子教材按单元词表提取的平台公共打字记词内容库",
    expectedUnitCounts: [40, 46, 47, 52, 20, 87, 61, 57],
    key: "7a",
    librarySlug: "yilin-english-grade-7-first-volume-wordlist",
    sortOrder: 0,
    textbookSlug: "smartedu-64f242e1-9902-067f-a769-7ed0a761c430",
    title: "译林版英语七年级上册词汇",
    unitStartPages: []
  },
  "7b": {
    assetKey: "yl-7b",
    description: "从电子教材字母词表提取并按首次出现页码归入单元的平台公共打字记词内容库",
    expectedUnitCounts: [57, 51, 56, 55, 55, 51, 59, 52],
    key: "7b",
    librarySlug: "yilin-english-grade-7-second-volume-wordlist",
    sortOrder: 1,
    textbookSlug: "smartedu-e5821850-2c91-440a-8b3c-41356ccd782a",
    title: "译林版英语七年级下册词汇",
    unitStartPages: [6, 18, 30, 42, 56, 68, 80, 92]
  },
  "8a": {
    assetKey: "yl-8a",
    description: "从电子教材字母词表提取并按首次出现页码归入单元的平台公共打字记词内容库",
    expectedUnitCounts: [58, 49, 59, 67, 65, 54, 49, 65],
    key: "8a",
    librarySlug: "yilin-english-grade-8-first-volume-wordlist",
    sortOrder: 2,
    textbookSlug: "smartedu-4573420f-2680-44e2-8def-7e8c4fa71297",
    title: "译林版英语八年级上册词汇",
    unitStartPages: [6, 18, 30, 42, 56, 68, 80, 92]
  },
  "8b": {
    assetKey: "yl-8b",
    description: "从电子教材字母词表提取并按首次出现页码归入单元的平台公共打字记词内容库",
    expectedUnitCounts: [43, 40, 55, 50, 57, 43, 39, 44],
    key: "8b",
    librarySlug: "yilin-english-grade-8-second-volume-wordlist",
    sortOrder: 3,
    textbookSlug: "smartedu-b33b5100-d1f9-427e-a9d6-03336612895a",
    title: "译林版英语八年级下册词汇",
    unitStartPages: [6, 20, 34, 48, 64, 78, 92, 106]
  },
  "9a": {
    assetKey: "yl-9a",
    description: "从电子教材字母词表提取并按首次出现页码归入单元的平台公共打字记词内容库",
    expectedUnitCounts: [65, 50, 50, 56, 51, 45, 54, 57],
    key: "9a",
    librarySlug: "yilin-english-grade-9-first-volume-wordlist",
    sortOrder: 4,
    textbookSlug: "smartedu-01b3ebf7-5e9a-471e-a5fe-beb76deb5207",
    title: "译林版英语九年级上册词汇",
    unitStartPages: [6, 20, 34, 48, 64, 78, 92, 106]
  },
  "9b": {
    assetKey: "yl-9b",
    description: "从电子教材字母词表提取并按首次出现页码归入单元的平台公共打字记词内容库",
    expectedUnitCounts: [44, 54, 41, 41],
    key: "9b",
    librarySlug: "yilin-english-grade-9-second-volume-wordlist",
    sortOrder: 5,
    textbookSlug: "smartedu-92286669-0bc5-423e-844c-06c4eddffd2e",
    title: "译林版英语九年级下册词汇",
    unitStartPages: [6, 20, 36, 50]
  },
  "b1": {
    assetKey: "yl-b1",
    description: "从电子教材两份词表对照提取并按单元归档的平台公共打字记词内容库",
    expectedUnitCounts: [66, 66, 74, 68],
    key: "b1",
    librarySlug: "yilin-senior-english-compulsory-volume-1-wordlist",
    sortOrder: 6,
    textbookSlug: "smartedu-cd1feeb4-b1db-4a44-9694-9d8c35ab02f5",
    title: "译林版高中英语必修第一册词汇",
    unitStartPages: [2, 15, 30, 43]
  },
  "b2": {
    assetKey: "yl-b2",
    description: "从电子教材两份词表对照提取并按单元归档的平台公共打字记词内容库",
    expectedUnitCounts: [75, 76, 82, 62],
    key: "b2",
    librarySlug: "yilin-senior-english-compulsory-volume-2-wordlist",
    sortOrder: 7,
    textbookSlug: "smartedu-0cbeba0b-b97b-4289-9b4e-f3a96f1e5b85",
    title: "译林版高中英语必修第二册词汇",
    unitStartPages: [1, 15, 30, 43]
  },
  "b3": {
    assetKey: "yl-b3",
    description: "从电子教材两份词表对照提取并按单元归档的平台公共打字记词内容库",
    expectedUnitCounts: [89, 69, 66, 72],
    key: "b3",
    librarySlug: "yilin-senior-english-compulsory-volume-3-wordlist",
    sortOrder: 8,
    textbookSlug: "smartedu-35590078-42c3-4778-aa6b-5330fe4b8b5c",
    title: "译林版高中英语必修第三册词汇",
    unitStartPages: [1, 16, 27, 44]
  },
  "xb1": {
    assetKey: "yl-xb1",
    description: "从电子教材两份词表对照提取并按单元归档的平台公共打字记词内容库",
    expectedUnitCounts: [91, 82, 74, 74],
    key: "xb1",
    librarySlug: "yilin-senior-english-selective-compulsory-volume-1-wordlist",
    sortOrder: 9,
    textbookSlug: "smartedu-2c7b457b-b325-4fe5-8a98-777bc9a43a3b",
    title: "译林版高中英语选择性必修第一册词汇",
    unitStartPages: [2, 15, 29, 43]
  },
  "xb2": {
    assetKey: "yl-xb2",
    description: "从电子教材两份词表对照提取并按单元归档的平台公共打字记词内容库",
    expectedUnitCounts: [86, 51, 119, 87],
    key: "xb2",
    librarySlug: "yilin-senior-english-selective-compulsory-volume-2-wordlist",
    sortOrder: 10,
    textbookSlug: "smartedu-f5cf58a2-7084-4961-9b85-188262aee41b",
    title: "译林版高中英语选择性必修第二册词汇",
    unitStartPages: [2, 16, 25, 44]
  },
  "xb3": {
    assetKey: "yl-xb3",
    description: "从电子教材两份词表对照提取并按单元归档的平台公共打字记词内容库",
    expectedUnitCounts: [83, 63, 78, 71],
    key: "xb3",
    librarySlug: "yilin-senior-english-selective-compulsory-volume-3-wordlist",
    sortOrder: 11,
    textbookSlug: "smartedu-d6da38b7-c9c4-49c9-8a30-53339903376a",
    title: "译林版高中英语选择性必修第三册词汇",
    unitStartPages: [2, 16, 29, 44]
  },
  "xb4": {
    assetKey: "yl-xb4",
    description: "从电子教材两份词表对照提取并按单元归档的平台公共打字记词内容库",
    expectedUnitCounts: [76, 67, 80, 72],
    key: "xb4",
    librarySlug: "yilin-senior-english-selective-compulsory-volume-4-wordlist",
    sortOrder: 12,
    textbookSlug: "smartedu-1a758899-7438-4f8b-9c2a-eb19ffb71b11",
    title: "译林版高中英语选择性必修第四册词汇",
    unitStartPages: [2, 16, 30, 43]
  }
};

export const yilinPrimaryTypingBookKeys = ["3a", "3b", "4a", "4b", "5a", "5b", "6a", "6b"] as const;
export const yilinSecondaryTypingBookKeys = ["7b", "8a", "8b", "9a", "9b"] as const;
export const yilinSeniorTypingBookKeys = ["b1", "b2", "b3", "xb1", "xb2", "xb3", "xb4"] as const;

export function getYilinTypingLibraryConfig(key: string) {
  if (!(key in yilinTypingLibraryConfigs)) {
    throw new Error(`不支持的译林版教材编号：${key}`);
  }

  return yilinTypingLibraryConfigs[key as YilinTypingBookKey];
}
