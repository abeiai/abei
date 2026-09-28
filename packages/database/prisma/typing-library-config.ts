import {
  getHujiaoTypingLibraryConfig,
  hujiaoTypingBookKeys,
  hujiaoTypingLibraryConfigs
} from "./hujiao-typing-library-config.js";
import {
  getYilinTypingLibraryConfig,
  yilinTypingLibraryConfigs
} from "./yilin-typing-library-config.js";
import {
  getPepTypingLibraryConfig,
  pepTypingBookKeys,
  pepTypingLibraryConfigs
} from "./pep-typing-library-config.js";

export interface TypingLibraryConfig {
  assetKey: string;
  expectedUnitCounts: readonly number[];
  key: string;
  librarySlug: string;
  title: string;
}

export const hujiaoTypingLibraryConfigList = hujiaoTypingBookKeys.map(
  (key) => hujiaoTypingLibraryConfigs[key]
);

export const yilinTypingLibraryConfigList = Object.values(yilinTypingLibraryConfigs);

export const pepTypingLibraryConfigList = pepTypingBookKeys.map(
  (key) => pepTypingLibraryConfigs[key]
);

export const typingLibraryConfigList = [
  ...yilinTypingLibraryConfigList,
  ...hujiaoTypingLibraryConfigList,
  ...pepTypingLibraryConfigList
];

export function getTypingLibraryConfig(selector: string): TypingLibraryConfig {
  const normalized = selector.trim().toLocaleLowerCase("en-GB");
  if (normalized.startsWith("hj-")) {
    return getHujiaoTypingLibraryConfig(normalized.slice(3));
  }
  if (normalized.startsWith("yl-")) {
    return getYilinTypingLibraryConfig(normalized.slice(3));
  }
  if (normalized.startsWith("pep-")) {
    return getPepTypingLibraryConfig(normalized.slice(4));
  }
  return getYilinTypingLibraryConfig(normalized);
}
