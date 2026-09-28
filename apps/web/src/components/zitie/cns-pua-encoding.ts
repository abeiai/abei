export type CopybookFontEncoding = "unicode" | "cns-pua" | "cns-ext-b";

const cnsPuaStart = 0xf0000;
const cnsPuaEnd = 0xffffd;
const cnsSupplementStart = 0x20000;
const cnsSupplementEnd = 0x323af;

const unicodeToCnsPua = new Map<number, number>([
  // Keep this table explicit. CNS Plus fonts use private-use glyphs for
  // supplemental/variant characters; common BMP Hanzi should fall back to the
  // normal Kai font instead of being guessed into an unrelated PUA glyph.
]);

export function encodeTextForFont(value: string, encoding?: CopybookFontEncoding) {
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

export function isCnsPuaFontName(value: string) {
  return /(?:TW-Kai-Plus|全字[庫库]正楷體?\s*Plus|Plus-98_1)/i.test(value);
}

export function isCnsExtBFontName(value: string) {
  return /(?:TW-Kai-Ext-B|Ext-B-98_1)/i.test(value);
}

export function isCnsBaseFontName(value: string) {
  return (
    /(?:TW-Kai-98_1|全字[庫库]正楷體?-98_1|cns-zhengkaiti-98)/i.test(value) &&
    !isCnsPuaFontName(value) &&
    !isCnsExtBFontName(value)
  );
}
