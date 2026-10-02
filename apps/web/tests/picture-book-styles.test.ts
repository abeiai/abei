import assert from "node:assert/strict";
import test from "node:test";
import { pictureBookStyleImageSource, selectedPictureBookStyle } from "../src/lib/picture-book-styles.js";

test("风格改名后稳定 ID 与旧绘本中文名称仍选中同一风格", () => {
  const style = { id: "watercolor", name: "新水彩名称", description: "淡水彩晕染", imageUrl: "/picture-book-styles/watercolor.webp", enabled: true };
  for (const value of ["watercolor", "温暖水彩", "水彩", "新水彩名称"]) assert.equal(selectedPictureBookStyle(value, [style]), style);
  assert.equal(selectedPictureBookStyle("原有自定义风格", [style]), undefined);
  const conflicting = [{ ...style, id: "flat", name: "watercolor" }, style];
  assert.equal(selectedPictureBookStyle("watercolor", conflicting), style);
});

test("默认示意图使用本地文件，R2 示意图通过目录 ID 读取并更新缓存版本", () => {
  const style = { id: "watercolor", name: "水彩", description: "水彩晕染", imageUrl: "/picture-book-styles/watercolor.webp", enabled: true };
  assert.equal(pictureBookStyleImageSource(style), style.imageUrl);
  const first = pictureBookStyleImageSource({ ...style, imageUrl: "https://r2.example/a.webp" });
  const second = pictureBookStyleImageSource({ ...style, imageUrl: "https://r2.example/b.webp" });
  assert.ok(first.startsWith("/api/system-config/picture-book-styles/watercolor/image?v="));
  assert.notEqual(first, second);
});
