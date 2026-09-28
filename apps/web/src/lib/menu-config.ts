export type SiteMenuItemType = "page" | "article" | "category" | "custom";

export interface SiteMenuItem {
  id: string;
  type: SiteMenuItemType;
  label: string;
  href: string;
  referenceId?: string;
  depth?: 0 | 1;
}

export interface SiteMenu {
  id: string;
  name: string;
  items: SiteMenuItem[];
}

export interface SiteMenuConfig {
  version: 1;
  menus: SiteMenu[];
  locations: {
    primaryMenuId?: string;
    footerMenuId?: string;
  };
}

export interface NavMenuItem {
  id: string;
  label: string;
  href: string;
  external: boolean;
  children: NavMenuItem[];
}

export const menuItemTypeLabels: Record<SiteMenuItemType, string> = {
  page: "页面",
  article: "文章",
  category: "分类目录",
  custom: "自定义链接"
};

export function emptySiteMenuConfig(): SiteMenuConfig {
  return {
    version: 1,
    menus: [],
    locations: {}
  };
}

export function parseSiteMenuConfig(value: string | null | undefined): SiteMenuConfig {
  if (!value?.trim()) {
    return emptySiteMenuConfig();
  }

  try {
    const parsed = JSON.parse(value) as Partial<SiteMenuConfig>;
    const menus = Array.isArray(parsed.menus)
      ? parsed.menus
          .map((menu, menuIndex) => normalizeMenu(menu, menuIndex))
          .filter((menu): menu is SiteMenu => Boolean(menu))
      : [];
    const menuIds = new Set(menus.map((menu) => menu.id));
    const primaryMenuId = String(parsed.locations?.primaryMenuId ?? "");
    const footerMenuId = String(parsed.locations?.footerMenuId ?? "");

    return {
      version: 1,
      menus,
      locations: {
        primaryMenuId: menuIds.has(primaryMenuId) ? primaryMenuId : "",
        footerMenuId: menuIds.has(footerMenuId) ? footerMenuId : ""
      }
    };
  } catch {
    return emptySiteMenuConfig();
  }
}

export function serializeSiteMenuConfig(config: SiteMenuConfig) {
  return JSON.stringify({
    version: 1,
    menus: config.menus.map((menu) => ({
      id: menu.id,
      name: menu.name,
      items: menu.items.map((item) => ({
        id: item.id,
        type: item.type,
        label: item.label,
        href: item.href,
        referenceId: item.referenceId ?? "",
        depth: item.depth === 1 ? 1 : 0
      }))
    })),
    locations: {
      primaryMenuId: config.locations.primaryMenuId ?? "",
      footerMenuId: config.locations.footerMenuId ?? ""
    }
  });
}

export function menuItemsToNavTree(items: SiteMenuItem[]): NavMenuItem[] {
  const roots: NavMenuItem[] = [];
  let currentRoot: NavMenuItem | null = null;

  for (const item of items) {
    const navItem: NavMenuItem = {
      id: item.id,
      label: item.label,
      href: item.href,
      external: isExternalHref(item.href),
      children: []
    };

    if (item.depth === 1 && currentRoot) {
      currentRoot.children.push(navItem);
      continue;
    }

    roots.push(navItem);
    currentRoot = navItem;
  }

  return roots;
}

export function getMenuByLocation(config: SiteMenuConfig, location: "primary" | "footer") {
  const menuId = location === "primary" ? config.locations.primaryMenuId : config.locations.footerMenuId;

  return config.menus.find((menu) => menu.id === menuId) ?? null;
}

export function buildMenuConfigFromLegacyNav(value: string | null | undefined): SiteMenuConfig {
  const items = String(value ?? "")
    .split("\n")
    .map((line, index): SiteMenuItem | null => {
      const [labelInput, hrefInput] = line.split("|");
      const label = String(labelInput ?? "").trim();
      const href = String(hrefInput ?? "").trim();

      return label && isSafeMenuHref(href)
        ? {
            id: `legacy-${index + 1}`,
            type: "custom" as const,
            label,
            href,
            referenceId: "",
            depth: 0 as const
          }
        : null;
    })
    .filter((item): item is SiteMenuItem => Boolean(item));

  return {
    version: 1,
    menus: [
      {
        id: "primary-menu",
        name: "Primary Menu",
        items
      }
    ],
    locations: {
      primaryMenuId: "primary-menu",
      footerMenuId: ""
    }
  };
}

export function isExternalHref(href: string) {
  return /^https?:\/\//i.test(href);
}

export function isSafeMenuHref(href: string) {
  if (href.startsWith("/") && !href.startsWith("//")) {
    return !href.includes("<") && !href.includes(">") && !href.toLowerCase().includes("javascript:");
  }

  if (!isExternalHref(href) || href.includes("<") || href.includes(">")) {
    return false;
  }

  try {
    const url = new URL(href);

    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeMenu(input: unknown, index: number): SiteMenu | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }

  const menu = input as Partial<SiteMenu>;
  const id = String(menu.id ?? `menu-${index + 1}`).trim();
  const name = String(menu.name ?? "").trim();

  if (!id || !name) {
    return null;
  }

  return {
    id,
    name,
    items: Array.isArray(menu.items)
      ? menu.items
          .map((item, itemIndex) => normalizeMenuItem(item, itemIndex))
          .filter((item): item is SiteMenuItem => Boolean(item))
      : []
  };
}

function normalizeMenuItem(input: unknown, index: number): SiteMenuItem | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }

  const item = input as Partial<SiteMenuItem>;
  const label = String(item.label ?? "").trim();
  const href = String(item.href ?? "").trim();
  const type = item.type && menuItemTypeLabels[item.type] ? item.type : "custom";

  if (!label || !isSafeMenuHref(href)) {
    return null;
  }

  return {
    id: String(item.id ?? `item-${index + 1}`).trim(),
    type,
    label,
    href,
    referenceId: String(item.referenceId ?? "").trim(),
    depth: item.depth === 1 ? 1 : 0
  };
}
