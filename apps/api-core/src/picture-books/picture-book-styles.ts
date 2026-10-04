import { HttpStatus } from "@nestjs/common";
import { AppException } from "../common/app-exception.js";

export interface PictureBookStyle { id: string; name: string; description: string; imageUrl: string; enabled: boolean }

const presets = [
  ["flat", "平面插画", "简洁的几何形状与清晰色块，二维扁平表现，柔和协调的配色。"],
  ["3d-animation", "三维动画", "圆润立体的三维动画造型，柔和全局光照，精致材质与景深。"],
  ["watercolor", "水彩", "透明水彩轻柔晕染，保留水痕和纸张纹理，色彩通透柔和。"],
  ["gouache", "水粉", "不透明水粉颜料，厚实哑光色块，层层覆盖的笔触与纸张质感。"],
  ["colored-pencil", "彩铅", "细腻的彩色铅笔排线与颗粒，清楚的纸纹，柔和自然的色彩。"],
  ["crayon", "蜡笔", "粗厚稚拙的彩色蜡笔线条，明显蜡质颗粒和纸张纹理，富有童趣。"],
  ["collage", "拼贴", "手工纸张与织物拼贴，撕纸边缘、不同纹理和清楚的层叠关系。"],
  ["paper-cut", "剪纸", "彩纸剪纸，清晰剪切轮廓、镂空细节、分层纸面和轻微阴影。"],
  ["pen-watercolor", "钢笔淡彩", "精细钢笔轮廓和少量排线，辅以通透淡水彩色块，线条清晰轻松。"],
  ["line-sketch", "纯线素描", "黑白纯线素描，只用铅笔轮廓、排线与疏密线条塑造景物，不使用颜色。"],
  ["woodcut", "木刻版画", "大胆有力的木刻刀刻线条，黑色与少量套印色，清楚的木纹印痕。"],
  ["clay-stop-motion", "黏土定格", "黏土定格动画手工场景，微小捏制痕迹、微缩布景与柔和摄影灯光。"],
  ["classic-oil","经典油画","经典油画的画布肌理与厚薄相间的油彩笔触，柔和明暗塑形，饱满协调的色彩。"],
  ["pixel-art","像素艺术","清晰可见的方形像素与有限色板，像素块勾勒轮廓和光影，复古游戏般的童趣。"],
  ["monochrome-ink","黑白水墨","仅用黑、白、灰表现中国水墨，墨色浓淡、干湿笔触、宣纸晕染与富有节奏的留白。"],
  ["color-ink","彩色水墨","中国水墨笔法结合淡雅彩色晕染，灵动墨线、宣纸渗色、疏密留白和轻盈意境。"],
  ["puppet-stop-motion","木偶定格","木偶定格动画的木质关节与布料服饰，手工微缩布景，温暖摄影灯光与真实材质。"],
  ["shadow-puppet","皮影剪影","皮影剪影的镂空雕花与透光皮革纹理，暖色幕布、影子和传统戏台光感。"],
  ["blue-printed-cloth","蓝印花布","靛蓝与本白的蓝印花布，防染印花般的线条和点纹，织物肌理与民间纹样装饰。"],
  ["tile-pottery","瓦当陶纹","瓦当与陶器纹样的浅浮雕造型，陶土赭色、云纹与几何线刻，朴拙温润的陶面肌理。"],
  ["woodblock-new-year","木板年画","民间木版年画的饱满套印色，清楚墨线与木版印痕，喜庆热闹、装饰性强的平面构图。"],
  ["dunhuang-mural","敦煌壁画","敦煌壁画的矿物色与流畅线描，赭石、石青、石绿的古朴配色，斑驳墙面与装饰纹样。"]
] as const;

export const defaultPictureBookStyles: PictureBookStyle[] = presets.map(([id, name, description]) => ({
  id, name, description, imageUrl: `/picture-book-styles/${id}.webp`, enabled: true
}));

export function parsePictureBookStyles(raw: string | null | undefined): PictureBookStyle[] {
  if (raw == null) return defaultPictureBookStyles.map(style => ({ ...style }));
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw invalid("绘画风格目录格式不正确"); }
  if (!Array.isArray(value) || value.length < 1 || value.length > 60) throw invalid("绘画风格目录应包含 1–60 个风格");
  const ids = new Set<string>(), names = new Set<string>();
  const styles = value.map(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw invalid("绘画风格内容不正确");
    const id = text(item.id, "标识", 80), name = text(item.name, "名称", 80);
    const description = text(item.description, "描述", 1000), imageUrl = text(item.imageUrl, "图片", 2048);
    if (id === "custom" || name === "自定义风格") throw invalid("自定义风格为用户上传入口，请使用其他名称与标识");
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw invalid("绘画风格标识不正确");
    if (ids.has(id) || names.has(name)) throw invalid("绘画风格标识或名称重复");
    ids.add(id); names.add(name);
    if (!/^\/picture-book-styles\/[a-z0-9-]+\.webp$/.test(imageUrl)) {
      try { const url = new URL(imageUrl); if (url.protocol !== "https:" || url.username || url.password) throw new Error(); }
      catch { throw invalid("绘画风格图片地址不正确"); }
    }
    if (typeof item.enabled !== "boolean") throw invalid("绘画风格启用状态不正确");
    return { id, name, description, imageUrl, enabled: item.enabled };
  });
  if (!styles.some(style => style.enabled)) throw invalid("至少启用一种绘画风格");
  return styles;
}

const legacyIds: Record<string, string> = { ...Object.fromEntries(presets.map(([id, name]) => [name, id])), "温暖水彩": "watercolor", "卡通插画": "flat", "彩色铅笔": "colored-pencil", "柔和黏土": "clay-stop-motion", "童话剪纸": "paper-cut" };
export function selectedPictureBookStyle(name: string, styles: PictureBookStyle[]) {
  return styles.find(item => item.id === name) ?? styles.find(item => item.id === legacyIds[name]) ?? styles.find(item => item.name === name);
}

export function customPictureBookStyleAssetId(value: string) {
  if (value !== "custom" && !value.startsWith("custom:")) return null;
  const match = /^custom:([a-z0-9]{20,64})$/.exec(value);
  if (!match) throw invalid("请先上传自定义风格参考图");
  return match[1]!;
}

function text(value: unknown, label: string, max: number) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw invalid(`绘画风格${label}不能为空且不能超过 ${max} 个字符`);
  return value.trim();
}
function invalid(message: string) { return new AppException(40001, message, HttpStatus.BAD_REQUEST); }
