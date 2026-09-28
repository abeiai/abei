import { createHash } from "node:crypto";

export interface TypingImageR2Target {
  filename: string;
  objectKey: string;
  publicUrl: string;
}

export const typingImageCacheControl = "public, max-age=300, must-revalidate";

interface BuildTypingImageR2TargetInput {
  keyPrefix: string;
  publicBaseUrl: string;
  relativePath: string;
}

interface TypingImageAssetState {
  filename: string;
  storageProvider: string;
  url: string;
}

interface MigrateTypingImageRecordInput {
  currentAsset: TypingImageAssetState;
  expectedCacheControl: string;
  expectedEtag: string;
  expectedSize: number;
  headObject: (objectKey: string) => Promise<{
    cacheControl: string;
    etag: string;
    size: number;
  } | null>;
  target: TypingImageR2Target;
  updateAsset: (target: TypingImageR2Target) => Promise<void>;
  uploadObject: (objectKey: string) => Promise<void>;
}

const typingImagePathPattern = /^uploads\/typing-content\/(?:yl-(?:[3-9][ab]|b[1-3]|xb[1-4])|hj-(?:[3-9][ab]|54-[67][ab]|b[1-3]|xb[1-4])|pep-[3-6][ab])\/unit-\d{2}\/images\/\d{2,3}-[a-z0-9][a-z0-9-]*\.png$/u;
const pngSignature = Buffer.from("89504e470d0a1a0a", "hex");

export function assertTypingImageUnitCounts(input: {
  expected: readonly {
    expectedUnitCounts: readonly number[];
    librarySlug: string;
  }[];
  rows: readonly {
    librarySlug: string;
    unitCode: string;
  }[];
}) {
  const actualCounts = new Map<string, number>();
  for (const row of input.rows) {
    const key = `${row.librarySlug}\u0000${row.unitCode}`;
    actualCounts.set(key, (actualCounts.get(key) ?? 0) + 1);
  }

  const expectedKeys = new Set<string>();
  const differences: string[] = [];
  for (const library of input.expected) {
    library.expectedUnitCounts.forEach((expectedCount, index) => {
      const unitCode = `unit-${String(index + 1).padStart(2, "0")}`;
      const key = `${library.librarySlug}\u0000${unitCode}`;
      const actualCount = actualCounts.get(key) ?? 0;
      expectedKeys.add(key);
      if (actualCount !== expectedCount) {
        differences.push(`${library.librarySlug} ${unitCode}：预期 ${expectedCount}，实际 ${actualCount}`);
      }
    });
  }

  for (const [key, actualCount] of actualCounts) {
    if (!expectedKeys.has(key)) {
      const [librarySlug, unitCode] = key.split("\u0000");
      differences.push(`${librarySlug} ${unitCode}：预期 0，实际 ${actualCount}`);
    }
  }

  if (differences.length > 0) {
    throw new Error(`正式词汇插图分单元数量不一致：${differences.join("；")}`);
  }
}

export function parseTypingImageMigrationArgs(argv: string[]) {
  let apply = false;
  let book: null | string = null;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") {
      continue;
    }
    if (argument === "--apply") {
      apply = true;
      continue;
    }
    if (argument === "--book") {
      const value = argv[index + 1]?.trim().toLocaleLowerCase("en-GB");
      if (!value || value.startsWith("--")) {
        throw new Error("--book 必须指定教材编号");
      }
      if (book) {
        throw new Error("--book 只能指定一次");
      }
      book = value;
      index += 1;
      continue;
    }
    if (argument.startsWith("--book=")) {
      const value = argument.slice("--book=".length).trim().toLocaleLowerCase("en-GB");
      if (!value) {
        throw new Error("--book 必须指定教材编号");
      }
      if (book) {
        throw new Error("--book 只能指定一次");
      }
      book = value;
      continue;
    }

    throw new Error(`未知参数：${argument}`);
  }

  return {
    apply,
    book
  };
}

export function inspectTypingImageSource(input: {
  body: Buffer;
  expectedHash: string;
  expectedSize: number;
}) {
  if (input.body.byteLength !== input.expectedSize) {
    throw new Error("词汇图片文件大小与登记记录不一致");
  }

  if (
    input.body.byteLength < 24
    || !input.body.subarray(0, 8).equals(pngSignature)
    || input.body.subarray(12, 16).toString("ascii") !== "IHDR"
    || input.body.readUInt32BE(16) !== 1024
    || input.body.readUInt32BE(20) !== 768
  ) {
    throw new Error("词汇图片必须为 1024×768 PNG");
  }

  const sha256 = createHash("sha256").update(input.body).digest("hex");
  if (!/^[a-f0-9]{64}$/u.test(input.expectedHash) || sha256 !== input.expectedHash) {
    throw new Error("词汇图片内容哈希与登记记录不一致");
  }

  return {
    etag: createHash("md5").update(input.body).digest("hex"),
    sha256,
    size: input.body.byteLength
  };
}

export function buildTypingImageR2Target(input: BuildTypingImageR2TargetInput) {
  const relativePath = input.relativePath.replaceAll("\\", "/").replace(/^\/+/, "");

  if (!typingImagePathPattern.test(relativePath)) {
    throw new Error(`词汇图片路径不合法：${input.relativePath}`);
  }

  const keyPrefix = normalizeTypingR2KeyPrefix(input.keyPrefix);
  const filename = relativePath.slice("uploads/".length);
  const objectKey = `${keyPrefix}${filename}`;
  const publicBaseUrl = input.publicBaseUrl.trim().replace(/\/+$/, "");

  if (!publicBaseUrl) {
    throw new Error("R2 公开访问地址未配置");
  }

  return {
    filename,
    objectKey,
    publicUrl: `${publicBaseUrl}/${objectKey}`
  };
}

export function typingImageRelativePathFromAsset(asset: TypingImageAssetState) {
  const relativePath = asset.storageProvider === "S3"
    ? `uploads/${asset.filename}`
    : asset.url.replace(/^\/+/, "");
  const normalized = relativePath.replaceAll("\\", "/");

  if (!typingImagePathPattern.test(normalized)) {
    throw new Error(`词汇图片路径不合法：${relativePath}`);
  }

  return normalized;
}

export async function migrateTypingImageRecord(input: MigrateTypingImageRecordInput) {
  const existing = await input.headObject(input.target.objectKey);
  let uploaded = false;

  if (!objectMatches(existing, input.expectedSize, input.expectedEtag, input.expectedCacheControl)) {
    await input.uploadObject(input.target.objectKey);
    uploaded = true;

    const verified = await input.headObject(input.target.objectKey);
    if (!objectMatches(verified, input.expectedSize, input.expectedEtag, input.expectedCacheControl)) {
      throw new Error(`R2 对象校验失败：${input.target.objectKey}`);
    }
  }

  const databaseUpdated = !(
    input.currentAsset.storageProvider === "S3"
    && input.currentAsset.filename === input.target.filename
    && input.currentAsset.url === input.target.publicUrl
  );

  if (databaseUpdated) {
    await input.updateAsset(input.target);
  }

  return {
    databaseUpdated,
    uploaded
  };
}

function objectMatches(
  object: { cacheControl: string; etag: string; size: number } | null,
  expectedSize: number,
  expectedEtag: string,
  expectedCacheControl: string
) {
  return Boolean(
    object
    && object.size === expectedSize
    && object.etag.replace(/^"|"$/g, "").toLocaleLowerCase("en-GB") === expectedEtag.toLocaleLowerCase("en-GB")
    && object.cacheControl === expectedCacheControl
  );
}

export function normalizeTypingR2KeyPrefix(value: string) {
  const prefix = value.trim().replace(/^\/+|\/+$/g, "");
  if (!prefix) {
    return "";
  }

  const segments = prefix.split("/");
  if (
    value.includes("\\")
    || /[?#]/u.test(prefix)
    || segments.some((segment) => (
      !segment
      || segment === "."
      || segment === ".."
      || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u.test(segment)
    ))
  ) {
    throw new Error(`R2 对象键前缀不合法：${value}`);
  }

  return `${segments.join("/")}/`;
}
