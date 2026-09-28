export const LEGACY_DEFAULT_PUBLIC_NAV_ITEMS =
  "首页|/\n功能|/features\n场景|/use-cases\n价格|/pricing\n文章|/articles\n用户中心|/dashboard";

export const DEFAULT_PUBLIC_NAV_ITEMS =
  "首页|/\n资源中心|/center\n功能|/features\n场景|/use-cases\n价格|/pricing\n文章|/articles\n用户中心|/dashboard";

export function migrateDefaultPublicNavItems(currentValue: string) {
  return normalizePublicNavItems(currentValue) === normalizePublicNavItems(LEGACY_DEFAULT_PUBLIC_NAV_ITEMS)
    ? DEFAULT_PUBLIC_NAV_ITEMS
    : currentValue;
}

function normalizePublicNavItems(value: string) {
  return value
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separatorIndex = line.indexOf("|");

      if (separatorIndex < 0) {
        return line;
      }

      return `${line.slice(0, separatorIndex).trim()}|${line.slice(separatorIndex + 1).trim()}`;
    })
    .join("\n");
}
