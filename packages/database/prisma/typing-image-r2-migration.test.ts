import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertTypingImageUnitCounts,
  buildTypingImageR2Target,
  inspectTypingImageSource,
  migrateTypingImageRecord,
  parseTypingImageMigrationArgs,
  typingImageRelativePathFromAsset
} from "./typing-image-r2-migration.js";

describe("typing image R2 migration", () => {
  it("rejects offsetting image count differences between libraries and units", () => {
    const expected = [
      {
        expectedUnitCounts: [2, 1],
        librarySlug: "book-a"
      },
      {
        expectedUnitCounts: [1],
        librarySlug: "book-b"
      }
    ];

    assert.doesNotThrow(() => assertTypingImageUnitCounts({
      expected,
      rows: [
        { librarySlug: "book-a", unitCode: "unit-01" },
        { librarySlug: "book-a", unitCode: "unit-01" },
        { librarySlug: "book-a", unitCode: "unit-02" },
        { librarySlug: "book-b", unitCode: "unit-01" }
      ]
    }));
    assert.throws(
      () => assertTypingImageUnitCounts({
        expected,
        rows: [
          { librarySlug: "book-a", unitCode: "unit-01" },
          { librarySlug: "book-a", unitCode: "unit-02" },
          { librarySlug: "book-a", unitCode: "unit-02" },
          { librarySlug: "book-b", unitCode: "unit-01" }
        ]
      }),
      /book-a unit-01：预期 2，实际 1；book-a unit-02：预期 1，实际 2/u
    );
  });

  it("parses both book syntaxes and rejects missing or unknown arguments", () => {
    assert.deepEqual(
      parseTypingImageMigrationArgs(["--", "--apply", "--book=7a"]),
      {
        apply: true,
        book: "7a"
      }
    );
    assert.deepEqual(
      parseTypingImageMigrationArgs(["--book", "8b"]),
      {
        apply: false,
        book: "8b"
      }
    );
    assert.throws(
      () => parseTypingImageMigrationArgs(["--apply", "--book"]),
      /--book 必须指定教材编号/u
    );
    assert.throws(
      () => parseTypingImageMigrationArgs(["--apply", "--books", "7a"]),
      /未知参数/u
    );
  });

  it("accepts only the exact registered 1024 by 768 PNG bytes", () => {
    const body = Buffer.alloc(32);
    Buffer.from("89504e470d0a1a0a", "hex").copy(body, 0);
    body.write("IHDR", 12, "ascii");
    body.writeUInt32BE(1024, 16);
    body.writeUInt32BE(768, 20);

    assert.deepEqual(
      inspectTypingImageSource({
        body,
        expectedHash: "33f845dda7ecb5d921dbe90c3d8211f67384271ff990963c207ad61dc8ad1212",
        expectedSize: 32
      }),
      {
        etag: "29d4c546f4f6d586ca4fa7e5d48ac4e9",
        sha256: "33f845dda7ecb5d921dbe90c3d8211f67384271ff990963c207ad61dc8ad1212",
        size: 32
      }
    );
    assert.throws(
      () => inspectTypingImageSource({
        body,
        expectedHash: "0".repeat(64),
        expectedSize: 32
      }),
      /内容哈希与登记记录不一致/u
    );
    assert.throws(
      () => inspectTypingImageSource({
        body,
        expectedHash: "33f845dda7ecb5d921dbe90c3d8211f67384271ff990963c207ad61dc8ad1212",
        expectedSize: 31
      }),
      /文件大小与登记记录不一致/u
    );
  });

  it("preserves the typing image directory below the configured R2 prefix", () => {
    const target = buildTypingImageR2Target({
      keyPrefix: "uploads/",
      publicBaseUrl: "https://cdn.xueleai.com/",
      relativePath: "uploads/typing-content/yl-8b/unit-03/images/30-musical.png"
    });

    assert.deepEqual(target, {
      filename: "typing-content/yl-8b/unit-03/images/30-musical.png",
      objectKey: "uploads/typing-content/yl-8b/unit-03/images/30-musical.png",
      publicUrl: "https://cdn.xueleai.com/uploads/typing-content/yl-8b/unit-03/images/30-musical.png"
    });

    assert.doesNotThrow(() => buildTypingImageR2Target({
      keyPrefix: "uploads/",
      publicBaseUrl: "https://cdn.xueleai.com/",
      relativePath: "uploads/typing-content/yl-3a/unit-01/images/01-class.png"
    }));
    assert.doesNotThrow(() => buildTypingImageR2Target({
      keyPrefix: "uploads/",
      publicBaseUrl: "https://cdn.xueleai.com/",
      relativePath: "uploads/typing-content/yl-b1/unit-01/images/01-potential.png"
    }));
    assert.doesNotThrow(() => buildTypingImageR2Target({
      keyPrefix: "uploads/",
      publicBaseUrl: "https://cdn.xueleai.com/",
      relativePath: "uploads/typing-content/yl-xb4/unit-04/images/01-auditory.png"
    }));
    assert.doesNotThrow(() => buildTypingImageR2Target({
      keyPrefix: "uploads/",
      publicBaseUrl: "https://cdn.xueleai.com/",
      relativePath: "uploads/typing-content/hj-3a/unit-01/images/01-happy.png"
    }));
    assert.doesNotThrow(() => buildTypingImageR2Target({
      keyPrefix: "uploads/",
      publicBaseUrl: "https://cdn.xueleai.com/",
      relativePath: "uploads/typing-content/hj-54-6b/unit-06/images/01-green.png"
    }));
    assert.doesNotThrow(() => buildTypingImageR2Target({
      keyPrefix: "uploads/",
      publicBaseUrl: "https://cdn.xueleai.com/",
      relativePath: "uploads/typing-content/hj-xb4/unit-04/images/01-auditory.png"
    }));
    assert.doesNotThrow(() => buildTypingImageR2Target({
      keyPrefix: "uploads/",
      publicBaseUrl: "https://cdn.xueleai.com/",
      relativePath: "uploads/typing-content/pep-6b/unit-04/images/22-dream.png"
    }));
  });

  it("rejects traversal paths and non-item images", () => {
    const config = {
      keyPrefix: "uploads/",
      publicBaseUrl: "https://cdn.xueleai.com"
    };

    assert.throws(
      () => buildTypingImageR2Target({
        ...config,
        relativePath: "uploads/typing-content/yl-7a/../secret.png"
      }),
      /词汇图片路径不合法/u
    );
    assert.throws(
      () => buildTypingImageR2Target({
        ...config,
        relativePath: "uploads/typing-content/yl-7a/unit-01/unit-01-contact-sheet.png"
      }),
      /词汇图片路径不合法/u
    );

    for (const keyPrefix of ["../uploads", "uploads/./typing", "uploads\\typing", "uploads?copy", "uploads#copy"]) {
      assert.throws(
        () => buildTypingImageR2Target({
          keyPrefix,
          publicBaseUrl: "https://cdn.xueleai.com",
          relativePath: "uploads/typing-content/yl-7a/unit-01/images/01-greet.png"
        }),
        /R2 对象键前缀不合法/u
      );
    }
  });

  it("recovers the same local path before and after database migration", () => {
    assert.equal(
      typingImageRelativePathFromAsset({
        filename: "01-ahlan.png",
        storageProvider: "LOCAL",
        url: "/uploads/typing-content/yl-7b/unit-01/images/01-ahlan.png"
      }),
      "uploads/typing-content/yl-7b/unit-01/images/01-ahlan.png"
    );
    assert.equal(
      typingImageRelativePathFromAsset({
        filename: "typing-content/yl-7b/unit-01/images/01-ahlan.png",
        storageProvider: "S3",
        url: "https://cdn.xueleai.com/uploads/typing-content/yl-7b/unit-01/images/01-ahlan.png"
      }),
      "uploads/typing-content/yl-7b/unit-01/images/01-ahlan.png"
    );
  });

  it("reuses an existing size-matched R2 object before updating the database", async () => {
    let uploadCount = 0;
    const updates: unknown[] = [];
    const target = {
      filename: "typing-content/yl-7b/unit-01/images/01-ahlan.png",
      objectKey: "uploads/typing-content/yl-7b/unit-01/images/01-ahlan.png",
      publicUrl: "https://cdn.xueleai.com/uploads/typing-content/yl-7b/unit-01/images/01-ahlan.png"
    };

    const result = await migrateTypingImageRecord({
      currentAsset: {
        filename: "01-ahlan.png",
        storageProvider: "LOCAL",
        url: "/uploads/typing-content/yl-7b/unit-01/images/01-ahlan.png"
      },
      expectedCacheControl: "public, max-age=300, must-revalidate",
      expectedEtag: "same-content",
      expectedSize: 1024,
      headObject: async () => ({
        cacheControl: "public, max-age=300, must-revalidate",
        etag: "same-content",
        size: 1024
      }),
      target,
      updateAsset: async (value) => {
        updates.push(value);
      },
      uploadObject: async () => {
        uploadCount += 1;
      }
    });

    assert.deepEqual(result, {
      databaseUpdated: true,
      uploaded: false
    });
    assert.equal(uploadCount, 0);
    assert.deepEqual(updates, [target]);
  });

  it("does not reuse a same-size R2 object when its content etag differs", async () => {
    let headCount = 0;
    let uploadCount = 0;

    const result = await migrateTypingImageRecord({
      currentAsset: {
        filename: "typing-content/yl-7b/unit-01/images/01-ahlan.png",
        storageProvider: "S3",
        url: "https://cdn.xueleai.com/uploads/typing-content/yl-7b/unit-01/images/01-ahlan.png"
      },
      expectedCacheControl: "public, max-age=300, must-revalidate",
      expectedEtag: "correct-content",
      expectedSize: 1024,
      headObject: async () => {
        headCount += 1;
        return {
          cacheControl: "public, max-age=300, must-revalidate",
          etag: headCount === 1 ? "wrong-content" : "correct-content",
          size: 1024
        };
      },
      target: {
        filename: "typing-content/yl-7b/unit-01/images/01-ahlan.png",
        objectKey: "uploads/typing-content/yl-7b/unit-01/images/01-ahlan.png",
        publicUrl: "https://cdn.xueleai.com/uploads/typing-content/yl-7b/unit-01/images/01-ahlan.png"
      },
      updateAsset: async () => undefined,
      uploadObject: async () => {
        uploadCount += 1;
      }
    });

    assert.deepEqual(result, {
      databaseUpdated: false,
      uploaded: true
    });
    assert.equal(uploadCount, 1);
  });

  it("reuploads an immutable object before keeping a reusable object key", async () => {
    let headCount = 0;
    let uploadCount = 0;

    const result = await migrateTypingImageRecord({
      currentAsset: {
        filename: "typing-content/yl-7b/unit-01/images/01-ahlan.png",
        storageProvider: "S3",
        url: "https://cdn.xueleai.com/uploads/typing-content/yl-7b/unit-01/images/01-ahlan.png"
      },
      expectedCacheControl: "public, max-age=300, must-revalidate",
      expectedEtag: "same-content",
      expectedSize: 1024,
      headObject: async () => {
        headCount += 1;
        return {
          cacheControl: headCount === 1
            ? "public, max-age=31536000, immutable"
            : "public, max-age=300, must-revalidate",
          etag: "same-content",
          size: 1024
        };
      },
      target: {
        filename: "typing-content/yl-7b/unit-01/images/01-ahlan.png",
        objectKey: "uploads/typing-content/yl-7b/unit-01/images/01-ahlan.png",
        publicUrl: "https://cdn.xueleai.com/uploads/typing-content/yl-7b/unit-01/images/01-ahlan.png"
      },
      updateAsset: async () => undefined,
      uploadObject: async () => {
        uploadCount += 1;
      }
    });

    assert.equal(result.uploaded, true);
    assert.equal(uploadCount, 1);
  });

  it("does not update the database when the uploaded object fails size verification", async () => {
    let headCount = 0;
    let updateCount = 0;

    await assert.rejects(
      migrateTypingImageRecord({
        currentAsset: {
          filename: "01-ahlan.png",
          storageProvider: "LOCAL",
          url: "/uploads/typing-content/yl-7b/unit-01/images/01-ahlan.png"
        },
        expectedCacheControl: "public, max-age=300, must-revalidate",
        expectedEtag: "correct-content",
        expectedSize: 1024,
        headObject: async () => {
          headCount += 1;
          return headCount === 1 ? null : {
            cacheControl: "public, max-age=300, must-revalidate",
            etag: "correct-content",
            size: 512
          };
        },
        target: {
          filename: "typing-content/yl-7b/unit-01/images/01-ahlan.png",
          objectKey: "uploads/typing-content/yl-7b/unit-01/images/01-ahlan.png",
          publicUrl: "https://cdn.xueleai.com/uploads/typing-content/yl-7b/unit-01/images/01-ahlan.png"
        },
        updateAsset: async () => {
          updateCount += 1;
        },
        uploadObject: async () => undefined
      }),
      /R2 对象校验失败/u
    );

    assert.equal(updateCount, 0);
  });
});
