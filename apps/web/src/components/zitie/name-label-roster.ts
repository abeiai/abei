export interface NameLabelRosterEntry {
  studentNumber: string;
  name: string;
}

const NAME_HEADERS = new Set(["姓名", "学生姓名", "名字", "name"]);
const NUMBER_HEADERS = new Set(["学号", "学生学号", "编号", "studentnumber", "studentno", "id"]);

export function parseNameLabelRosterRows(rows: unknown[][]): NameLabelRosterEntry[] {
  const normalizedRows = rows
    .map((row) => row.map(normalizeCell))
    .filter((row) => row.some(Boolean));

  if (normalizedRows.length === 0) {
    return [];
  }

  const headerRow = normalizedRows[0] ?? [];
  const nameIndex = headerRow.findIndex((cell) => NAME_HEADERS.has(normalizeHeader(cell)));
  const numberIndex = headerRow.findIndex((cell) => NUMBER_HEADERS.has(normalizeHeader(cell)));
  const hasHeader = nameIndex >= 0 && numberIndex >= 0;
  const dataRows = hasHeader ? normalizedRows.slice(1) : normalizedRows;

  return dataRows.flatMap((row) => {
    if (hasHeader) {
      return createRosterEntry(row[numberIndex] ?? "", row[nameIndex] ?? "");
    }

    const values = row.filter(Boolean);

    if (values.length < 2) {
      return [];
    }

    const [first = "", second = ""] = values;
    const firstLooksLikeNumber = looksLikeStudentNumber(first);
    const secondLooksLikeNumber = looksLikeStudentNumber(second);

    if (!firstLooksLikeNumber && secondLooksLikeNumber) {
      return createRosterEntry(second, first);
    }

    return createRosterEntry(first, second);
  });
}

export function parseNameLabelRosterText(input: string): NameLabelRosterEntry[] {
  const normalized = input.replace(/\r\n?/g, "\n").trim();

  if (!normalized) {
    return [];
  }

  const blocks = normalized.split(/\n\s*\n+/u);
  const entries: NameLabelRosterEntry[] = [];
  const tableRows: string[][] = [];

  for (const block of blocks) {
    const name = extractField(block, ["姓名", "学生姓名", "名字"]);
    const studentNumber = extractField(block, ["学号", "学生学号", "编号"]);

    if (name && studentNumber) {
      entries.push({ studentNumber, name });
      continue;
    }

    for (const line of block.split("\n")) {
      const cells = splitRosterLine(line);

      if (cells.some(Boolean)) {
        tableRows.push(cells);
      }
    }
  }

  return [...entries, ...parseNameLabelRosterRows(tableRows)];
}

export function formatNameLabelRosterInput(entries: NameLabelRosterEntry[]) {
  return entries
    .map((entry) => `姓名：${entry.name}\n学号：${entry.studentNumber}`)
    .join("\n\n");
}

export function paginateNameLabelRosterGroups(groups: string[][]) {
  return groups.map((group) => [group]);
}

function createRosterEntry(studentNumber: string, name: string): NameLabelRosterEntry[] {
  const normalizedNumber = studentNumber.trim();
  const normalizedName = name.trim();

  if (!normalizedNumber || !normalizedName) {
    return [];
  }

  return [{ studentNumber: normalizedNumber, name: normalizedName }];
}

function normalizeCell(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[\s_:：-]/gu, "");
}

function looksLikeStudentNumber(value: string) {
  return /\d/u.test(value) && /^[\p{L}\d_.-]+$/u.test(value);
}

function extractField(block: string, labels: string[]) {
  const labelPattern = labels.map(escapeRegExp).join("|");
  const match = new RegExp(`(?:^|\\s)(?:${labelPattern})\\s*[:：]\\s*([^\\s,，;；]+)`, "iu")
    .exec(block);

  return match?.[1]?.trim() ?? "";
}

function splitRosterLine(line: string) {
  const trimmed = line.trim();

  if (!trimmed) {
    return [];
  }

  if (trimmed.includes("\t")) {
    return trimmed.split(/\t+/u).map((cell) => cell.trim());
  }

  if (/[，,；;]/u.test(trimmed)) {
    return trimmed.split(/[，,；;]+/u).map((cell) => cell.trim());
  }

  return trimmed.split(/\s+/u).map((cell) => cell.trim());
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
