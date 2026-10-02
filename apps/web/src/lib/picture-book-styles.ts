export interface PictureBookStyle { id: string; name: string; description: string; imageUrl: string; enabled: boolean }

export function pictureBookStyleImageSource(style: PictureBookStyle) {
  return style.imageUrl.startsWith("/picture-book-styles/") ? style.imageUrl
    : `/api/system-config/picture-book-styles/${encodeURIComponent(style.id)}/image?v=${encodeURIComponent(style.imageUrl)}`;
}

const legacyIds: Record<string, string> = { "平面插画": "flat", "三维动画": "3d-animation", "水彩": "watercolor", "水粉": "gouache", "彩铅": "colored-pencil", "蜡笔": "crayon", "拼贴": "collage", "剪纸": "paper-cut", "钢笔淡彩": "pen-watercolor", "纯线素描": "line-sketch", "木刻版画": "woodcut", "黏土定格": "clay-stop-motion", "温暖水彩": "watercolor", "卡通插画": "flat", "彩色铅笔": "colored-pencil", "柔和黏土": "clay-stop-motion", "童话剪纸": "paper-cut" };
export function selectedPictureBookStyle(name: string, styles: PictureBookStyle[]) {
  return styles.find(style => style.id === name) ?? styles.find(style => style.id === legacyIds[name]) ?? styles.find(style => style.name === name);
}

export async function loadPictureBookStyles(): Promise<PictureBookStyle[]> {
  const response = await fetch("/api/system-config/public", { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok || payload.code !== 0) throw new Error("绘画风格加载失败，请稍后重试");
  const config = payload.data.find((item: { key: string }) => item.key === "pictureBookStyles");
  try {
    const styles = JSON.parse(config.value) as PictureBookStyle[];
    if (!Array.isArray(styles) || !styles.some(style => style.enabled)) throw new Error();
    return styles;
  } catch { throw new Error("绘画风格配置不正确，请联系管理员"); }
}
