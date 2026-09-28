import assert from "node:assert/strict";
import test from "node:test";
import { signStudentPhotoDownload, verifyStudentPhotoDownload } from "../src/lib/student-photo-download-token";

test("证照下载链接只对生成用户有效且不能篡改", () => {
  const previous = process.env.JWT_ACCESS_SECRET;
  process.env.JWT_ACCESS_SECRET = "test-student-photo-secret";
  try {
    const token = signStudentPhotoDownload({
      userId: "user-1", url: "https://example.aliyuncs.com/photo.png", index: 1, widthMm: 22, heightMm: 32
    });
    assert.equal(verifyStudentPhotoDownload(token, "user-1")?.widthMm, 22);
    assert.equal(verifyStudentPhotoDownload(token, "user-2"), null);
    assert.equal(verifyStudentPhotoDownload(`${token}x`, "user-1"), null);
  } finally {
    if (previous === undefined) delete process.env.JWT_ACCESS_SECRET;
    else process.env.JWT_ACCESS_SECRET = previous;
  }
});
