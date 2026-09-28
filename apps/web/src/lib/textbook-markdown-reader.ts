export interface TextbookMarkdownReaderPage {
  id: string;
  imageUrl: null | string;
  imageUrls: string[];
  markdown: string;
  pageNumber: number;
  title: string;
}

export interface TextbookMarkdownReaderUnit {
  id: string;
  imageUrls: string[];
  markdown: string;
  pageNumbers: number[];
  title: string;
}

export interface TextbookMarkdownReaderData {
  pages: TextbookMarkdownReaderPage[];
  units: TextbookMarkdownReaderUnit[];
}

interface PageMatch {
  index: number;
  pageNumber: number;
  title: string;
}

export function parseTextbookMarkdownReader(content: string): TextbookMarkdownReaderData {
  const pages = parsePages(content);
  const units = parseUnits(pages);

  return {
    pages,
    units
  };
}

export function stripTextbookMarkdownToPlainText(markdown: string) {
  return markdown
    .split(/\r?\n/)
    .map((line) => normalizePlainTextLine(line))
    .filter(Boolean)
    .join("\n");
}

function parsePages(content: string): TextbookMarkdownReaderPage[] {
  const matches = Array.from(content.matchAll(/^##\s*第\s*(\d+)\s*页\s*$/gm)).map<PageMatch>((match) => ({
    index: match.index ?? 0,
    pageNumber: Number(match[1]),
    title: `第 ${Number(match[1])} 页`
  }));

  if (!matches.length) {
    const imageUrls = extractMarkdownImageUrls(content);
    const imageUrl = imageUrls[0] ?? null;

    return [
      {
        id: "page-1",
        imageUrl,
        imageUrls: imageUrl ? [imageUrl] : [],
        markdown: content.trim(),
        pageNumber: 1,
        title: "全文"
      }
    ];
  }

  return matches.map((match, index) => {
    const nextMatch = matches[index + 1];
    const markdown = content.slice(match.index, nextMatch?.index ?? content.length).trim();
    const imageUrls = extractMarkdownImageUrls(markdown);
    const imageUrl = findOriginalPageImageUrl(imageUrls, match.pageNumber);

    return {
      id: `page-${match.pageNumber}`,
      imageUrl,
      imageUrls: imageUrl ? [imageUrl] : [],
      markdown,
      pageNumber: match.pageNumber,
      title: match.title
    };
  });
}

function parseUnits(pages: TextbookMarkdownReaderPage[]): TextbookMarkdownReaderUnit[] {
  const units: TextbookMarkdownReaderUnit[] = [];
  let currentUnit: TextbookMarkdownReaderUnit | null = null;
  let currentUnitKey: string | null = null;

  for (const page of pages) {
    const unitTitle = findUnitTitle(page.markdown);
    const unitKey = unitTitle ? getUnitKey(unitTitle) : null;

    if (!currentUnit || (unitKey && unitKey !== currentUnitKey)) {
      currentUnit = {
        id: `unit-${units.length + 1}`,
        imageUrls: [],
        markdown: "",
        pageNumbers: [],
        title: unitTitle ?? "正文"
      };
      currentUnitKey = unitKey;
      units.push(currentUnit);
    } else if (unitTitle && unitKey === currentUnitKey && unitTitle.length > currentUnit.title.length) {
      currentUnit.title = unitTitle;
    }

    currentUnit.markdown = [currentUnit.markdown, page.markdown].filter(Boolean).join("\n\n");
    currentUnit.pageNumbers.push(page.pageNumber);

    if (page.imageUrl) {
      currentUnit.imageUrls.push(page.imageUrl);
    }
  }

  return units;
}

function findUnitTitle(markdown: string) {
  if (/^#{1,4}\s*.*(?:目录|录目)\s*$/m.test(markdown)) {
    return null;
  }

  const lines = markdown.split(/\r?\n/);

  for (const line of lines) {
    const title = normalizeUnitTitle(line);

    if (title) {
      return title;
    }
  }

  return null;
}

function normalizeUnitTitle(line: string) {
  const cleanedLine = line
    .replace(/^#{1,4}\s*/, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleanedLine || cleanedLine.startsWith("!") || /[／/]\s*\d+\s*$/.test(cleanedLine)) {
    return null;
  }

  const directMatch = cleanedLine.match(/^(第[一二三四五六七八九十百千万0-9]+单元[\s\u3000]*[^\n]{0,24})$/);

  if (directMatch?.[1]) {
    return directMatch[1].trim();
  }

  const embeddedMatch = cleanedLine.length <= 80 ? cleanedLine.match(/(第[一二三四五六七八九十百千万0-9]+单元[\s\u3000]*[\u4e00-\u9fa5]{0,12})/) : null;

  return embeddedMatch?.[1]?.trim() ?? null;
}

function getUnitKey(title: string) {
  return title.match(/第[一二三四五六七八九十百千万0-9]+单元/)?.[0] ?? title;
}

function findOriginalPageImageUrl(imageUrls: string[], pageNumber: number) {
  const pageImageName = `page-${String(pageNumber).padStart(3, "0")}.png`;

  return imageUrls.find((url) => url.includes(pageImageName)) ?? imageUrls.find((url) => /\/page-\d+\.png(?:$|\?)/.test(url)) ?? imageUrls[0] ?? null;
}

function extractMarkdownImageUrls(markdown: string) {
  return Array.from(markdown.matchAll(/!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)).map((match) => match[1]);
}

function normalizePlainTextLine(line: string) {
  let text = line.trim();

  if (!text || /^[-*_]{3,}$/.test(text) || /^!\[[^\]]*]\([^)]*\)\s*$/.test(text)) {
    return "";
  }

  if (/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(text)) {
    return "";
  }

  text = text
    .replace(/^#{1,6}\s*/, "")
    .replace(/^>\s*/, "")
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/[`*_~]/g, "")
    .trim();

  if (text.includes("|")) {
    text = text
      .split("|")
      .map((cell) => cell.trim())
      .filter(Boolean)
      .join(" ");
  }

  return text.replace(/\s+/g, " ").trim();
}
