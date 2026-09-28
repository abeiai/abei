export type CopybookFontEncoding = "unicode" | "cns-pua" | "cns-ext-b";

const cnsPuaStart = 0xf0000;
const cnsPuaEnd = 0xffffd;
const cnsSupplementStart = 0x20000;
const cnsSupplementEnd = 0x323af;

const unicodeToCnsPua = new Map<number, number>([
  // Only safe one-to-one overrides belong here. CNS Plus fonts mostly contain
  // supplemental private-use glyphs, so common BMP Hanzi must not be guessed.
]);

export function encodeTextForFont(value: string, encoding?: CopybookFontEncoding | null) {
  if (encoding !== "cns-pua" || value.length === 0) {
    return value;
  }

  let changed = false;
  let result = "";

  for (const char of value) {
    const codePoint = char.codePointAt(0);
    const mapped = codePoint === undefined ? undefined : unicodeToCnsPua.get(codePoint);

    if (mapped === undefined) {
      result += char;
      continue;
    }

    changed = true;
    result += String.fromCodePoint(mapped);
  }

  return changed ? result : value;
}

export function containsCnsPua(value: string) {
  for (const char of value) {
    const codePoint = char.codePointAt(0);

    if (codePoint !== undefined && codePoint >= cnsPuaStart && codePoint <= cnsPuaEnd) {
      return true;
    }
  }

  return false;
}

export function containsCnsSupplement(value: string) {
  for (const char of value) {
    const codePoint = char.codePointAt(0);

    if (codePoint !== undefined && codePoint >= cnsSupplementStart && codePoint <= cnsSupplementEnd) {
      return true;
    }
  }

  return false;
}
