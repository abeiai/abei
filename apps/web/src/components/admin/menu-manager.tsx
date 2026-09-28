"use client";

import { type DragEvent, useActionState, useMemo, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronDown, GripVertical, Link2, Plus, Save, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ActionToast } from "@/components/ui/action-toast";
import {
  buildMenuConfigFromLegacyNav,
  isSafeMenuHref,
  menuItemTypeLabels,
  parseSiteMenuConfig,
  serializeSiteMenuConfig,
  type SiteMenu,
  type SiteMenuConfig,
  type SiteMenuItem,
  type SiteMenuItemType
} from "@/lib/menu-config";
import { saveMenuConfigAction, type MenuConfigActionState } from "@/lib/settings-api";
import { cn } from "@/lib/utils";

interface MenuSourceItem {
  id: string;
  title: string;
  slug: string;
  status?: string;
}

interface MenuManagerProps {
  articles: MenuSourceItem[];
  categories: MenuSourceItem[];
  initialConfigValue: string;
  legacyNavItems: string;
  pages: MenuSourceItem[];
}

type SourceType = "pages" | "articles" | "categories";
type DropMode = "before" | "after" | "child";

interface DropIntent {
  mode: DropMode;
  targetId: string;
}

const initialSaveState: MenuConfigActionState = {};

export function MenuManager({
  articles,
  categories,
  initialConfigValue,
  legacyNavItems,
  pages
}: MenuManagerProps) {
  const initialConfig = useMemo(() => {
    const parsed = parseSiteMenuConfig(initialConfigValue);

    return parsed.menus.length > 0 ? parsed : buildMenuConfigFromLegacyNav(legacyNavItems);
  }, [initialConfigValue, legacyNavItems]);
  const [config, setConfig] = useState<SiteMenuConfig>(initialConfig);
  const [activeMenuId, setActiveMenuId] = useState(() => initialConfig.locations.primaryMenuId || initialConfig.menus[0]?.id || "");
  const [activeTab, setActiveTab] = useState<"edit" | "locations">("edit");
  const [selectedSources, setSelectedSources] = useState<Record<SourceType, string[]>>({
    pages: [],
    articles: [],
    categories: []
  });
  const [customLabel, setCustomLabel] = useState("");
  const [customHref, setCustomHref] = useState("");
  const [draggingItemId, setDraggingItemId] = useState("");
  const [dropIntent, setDropIntent] = useState<DropIntent | null>(null);
  const [newMenuName, setNewMenuName] = useState("");
  const [saveState, saveFormAction, isSavePending] = useActionState(saveMenuConfigAction, initialSaveState);

  const activeMenu = config.menus.find((menu) => menu.id === activeMenuId) ?? config.menus[0] ?? null;
  const serializedConfig = serializeSiteMenuConfig(config);

  function updateActiveMenu(updater: (menu: SiteMenu) => SiteMenu) {
    if (!activeMenu) {
      return;
    }

    setConfig((current) => ({
      ...current,
      menus: current.menus.map((menu) => (menu.id === activeMenu.id ? updater(menu) : menu))
    }));
  }

  function createMenu() {
    const name = newMenuName.trim();

    if (!name) {
      return;
    }

    const menu: SiteMenu = {
      id: createId("menu"),
      name,
      items: []
    };

    setConfig((current) => ({
      ...current,
      menus: [...current.menus, menu],
      locations: {
        ...current.locations,
        primaryMenuId: current.locations.primaryMenuId || menu.id
      }
    }));
    setActiveMenuId(menu.id);
    setNewMenuName("");
  }

  function deleteActiveMenu() {
    if (!activeMenu) {
      return;
    }

    setConfig((current) => {
      const menus = current.menus.filter((menu) => menu.id !== activeMenu.id);
      const nextActiveId = menus[0]?.id || "";

      return {
        ...current,
        menus,
        locations: {
          primaryMenuId: current.locations.primaryMenuId === activeMenu.id ? nextActiveId : current.locations.primaryMenuId,
          footerMenuId: current.locations.footerMenuId === activeMenu.id ? "" : current.locations.footerMenuId
        }
      };
    });
  }

  function addSelected(type: SourceType, items: MenuSourceItem[]) {
    const selectedIds = new Set(selectedSources[type]);
    const nextItems = items
      .filter((item) => selectedIds.has(item.id))
      .map((item): SiteMenuItem => {
        const itemType: SiteMenuItemType = type === "pages" ? "page" : type === "articles" ? "article" : "category";

        return {
          id: createId(itemType),
          type: itemType,
          label: item.title,
          href: sourceHref(itemType, item.slug),
          referenceId: item.id,
          depth: 0
        };
      });

    if (nextItems.length === 0) {
      return;
    }

    updateActiveMenu((menu) => ({
      ...menu,
      items: [...menu.items, ...nextItems]
    }));
    setSelectedSources((current) => ({ ...current, [type]: [] }));
  }

  function addCustomItem() {
    const label = customLabel.trim();
    const href = customHref.trim();

    if (!label || !isSafeMenuHref(href)) {
      return;
    }

    updateActiveMenu((menu) => ({
      ...menu,
      items: [
        ...menu.items,
        {
          id: createId("custom"),
          type: "custom",
          label,
          href,
          referenceId: "",
          depth: 0
        }
      ]
    }));
    setCustomLabel("");
    setCustomHref("");
  }

  function updateMenuItem(itemId: string, patch: Partial<SiteMenuItem>) {
    updateActiveMenu((menu) => ({
      ...menu,
      items: menu.items.map((item) => (item.id === itemId ? { ...item, ...patch } : item))
    }));
  }

  function removeMenuItem(itemId: string) {
    updateActiveMenu((menu) => ({
      ...menu,
      items: menu.items.filter((item) => item.id !== itemId)
    }));
  }

  function moveItem(itemId: string, direction: -1 | 1) {
    updateActiveMenu((menu) => {
      const index = menu.items.findIndex((item) => item.id === itemId);

      if (index < 0) {
        return menu;
      }

      const item = menu.items[index];
      const range = getMenuItemBlockRange(menu.items, index);

      if (!item || !range) {
        return menu;
      }

      const movingBlock = menu.items.slice(range.start, range.end + 1);
      const remainingItems = [
        ...menu.items.slice(0, range.start),
        ...menu.items.slice(range.end + 1)
      ];

      if (item.depth === 1) {
        const siblingIndex = index + direction;
        const sibling = menu.items[siblingIndex];

        if (!sibling || sibling.depth !== 1) {
          return menu;
        }

        const siblingIndexAfterRemove = remainingItems.findIndex((current) => current.id === sibling.id);

        if (siblingIndexAfterRemove < 0) {
          return menu;
        }

        return {
          ...menu,
          items: insertMenuBlock(
            remainingItems,
            normalizeMenuBlockDepth(movingBlock, 1),
            direction === -1 ? siblingIndexAfterRemove : siblingIndexAfterRemove + 1
          )
        };
      }

      if (direction === -1) {
        const previousIndex = range.start - 1;

        if (previousIndex < 0) {
          return menu;
        }

        const previousRootIndex = menu.items[previousIndex]?.depth === 1 ? getParentIndex(menu.items, previousIndex) : previousIndex;
        const previousRoot = menu.items[previousRootIndex];
        const insertIndex = previousRoot ? remainingItems.findIndex((current) => current.id === previousRoot.id) : -1;

        if (insertIndex < 0) {
          return menu;
        }

        return {
          ...menu,
          items: insertMenuBlock(remainingItems, normalizeMenuBlockDepth(movingBlock, 0), insertIndex)
        };
      }

      const nextIndex = range.end + 1;
      const nextRoot = menu.items[nextIndex];

      if (!nextRoot) {
        return menu;
      }

      const nextRootIndex = remainingItems.findIndex((current) => current.id === nextRoot.id);
      const nextRootRange = getMenuItemBlockRange(remainingItems, nextRootIndex);

      if (nextRootIndex < 0 || !nextRootRange) {
        return menu;
      }

      return {
        ...menu,
        items: insertMenuBlock(remainingItems, normalizeMenuBlockDepth(movingBlock, 0), nextRootRange.end + 1)
      };
    });
  }

  function canDraggedItemBecomeChild() {
    if (!activeMenu || !draggingItemId) {
      return false;
    }

    const draggingIndex = activeMenu.items.findIndex((item) => item.id === draggingItemId);

    if (draggingIndex < 0) {
      return false;
    }

    const range = getMenuItemBlockRange(activeMenu.items, draggingIndex);

    return range ? range.start === range.end : false;
  }

  function dragMenuItem(event: DragEvent<HTMLElement>, itemId: string) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", itemId);
    setDraggingItemId(itemId);
    setDropIntent(null);
  }

  function previewMenuItemDrop(event: DragEvent<HTMLElement>, targetItem: SiteMenuItem) {
    if (!draggingItemId || draggingItemId === targetItem.id) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropIntent({
      mode: getDropMode(event, targetItem, canDraggedItemBecomeChild()),
      targetId: targetItem.id
    });
  }

  function dropMenuItem(event: DragEvent<HTMLElement>, targetItem: SiteMenuItem) {
    if (!draggingItemId || draggingItemId === targetItem.id) {
      setDraggingItemId("");
      setDropIntent(null);
      return;
    }

    event.preventDefault();
    reorderMenuItem(targetItem.id, getDropMode(event, targetItem, canDraggedItemBecomeChild()));
    setDraggingItemId("");
    setDropIntent(null);
  }

  function reorderMenuItem(targetId: string, mode: DropMode) {
    if (!draggingItemId) {
      return;
    }

    updateActiveMenu((menu) => {
      const dragIndex = menu.items.findIndex((item) => item.id === draggingItemId);
      const targetIndex = menu.items.findIndex((item) => item.id === targetId);

      if (dragIndex < 0 || targetIndex < 0) {
        return menu;
      }

      const dragRange = getMenuItemBlockRange(menu.items, dragIndex);

      if (!dragRange || (targetIndex >= dragRange.start && targetIndex <= dragRange.end)) {
        return menu;
      }

      const movingBlock = menu.items.slice(dragRange.start, dragRange.end + 1);
      const remainingItems = [
        ...menu.items.slice(0, dragRange.start),
        ...menu.items.slice(dragRange.end + 1)
      ];
      const remainingTargetIndex = remainingItems.findIndex((item) => item.id === targetId);

      if (remainingTargetIndex < 0) {
        return menu;
      }

      if (movingBlock.length > 1) {
        return {
          ...menu,
          items: insertMenuBlock(
            remainingItems,
            normalizeMenuBlockDepth(movingBlock, 0),
            getRootBlockInsertIndex(remainingItems, remainingTargetIndex, mode)
          )
        };
      }

      const target = remainingItems[remainingTargetIndex];
      const nextDepth = mode === "child" && target.depth !== 1 ? 1 : target.depth === 1 ? 1 : 0;
      const nextItem = {
        ...movingBlock[0],
        depth: nextDepth as 0 | 1
      };

      return {
        ...menu,
        items: insertMenuBlock(
          remainingItems,
          [nextItem],
          getSingleItemInsertIndex(remainingItems, remainingTargetIndex, mode)
        )
      };
    });
  }

  function setLocation(location: "primaryMenuId" | "footerMenuId", menuId: string) {
    setConfig((current) => ({
      ...current,
      locations: {
        ...current.locations,
        [location]: menuId
      }
    }));
  }

  return (
    <div className="flex flex-col gap-6">
      <ActionToast state={saveState} />
      <div className="flex flex-wrap items-center gap-2 border-b border-border">
        <button
          className={cn(
            "border border-b-0 border-border px-4 py-3 text-sm font-semibold",
            activeTab === "edit" ? "bg-background text-foreground" : "bg-secondary text-muted-foreground"
          )}
          onClick={() => setActiveTab("edit")}
          type="button"
        >
          编辑菜单
        </button>
        <button
          className={cn(
            "border border-b-0 border-border px-4 py-3 text-sm font-semibold",
            activeTab === "locations" ? "bg-background text-foreground" : "bg-secondary text-muted-foreground"
          )}
          onClick={() => setActiveTab("locations")}
          type="button"
        >
          管理位置
        </button>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6 lg:flex-row lg:items-end">
          <Field className="max-w-xl flex-1">
            <FieldLabel htmlFor="activeMenu">选择要编辑的菜单</FieldLabel>
            <Select id="activeMenu" value={activeMenu?.id ?? ""} onChange={(event) => setActiveMenuId(event.target.value)}>
              {config.menus.map((menu) => (
                <option key={menu.id} value={menu.id}>
                  {menu.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field className="max-w-sm flex-1">
            <FieldLabel htmlFor="newMenuName">创建新菜单</FieldLabel>
            <Input
              id="newMenuName"
              onChange={(event) => setNewMenuName(event.target.value)}
              placeholder="例如：页脚菜单"
              value={newMenuName}
            />
          </Field>
          <Button onClick={createMenu} type="button" variant="outline">
            <Plus data-icon="inline-start" />
            创建菜单
          </Button>
        </CardContent>
      </Card>

      {activeTab === "locations" ? (
        <Card>
          <CardHeader>
            <CardTitle>管理位置</CardTitle>
            <CardDescription>为前台顶部菜单和底部菜单选择要显示的菜单。</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={saveFormAction} className="grid gap-5 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
              <input name="siteMenus" type="hidden" value={serializedConfig} />
              <input name="saveLabel" type="hidden" value="菜单位置" />
              <Field>
                <FieldLabel htmlFor="primaryMenuId">顶部菜单</FieldLabel>
                <Select
                  id="primaryMenuId"
                  value={config.locations.primaryMenuId ?? ""}
                  onChange={(event) => setLocation("primaryMenuId", event.target.value)}
                >
                  <option value="">不指定</option>
                  {config.menus.map((menu) => (
                    <option key={menu.id} value={menu.id}>
                      {menu.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="footerMenuId">底部菜单</FieldLabel>
                <Select
                  id="footerMenuId"
                  value={config.locations.footerMenuId ?? ""}
                  onChange={(event) => setLocation("footerMenuId", event.target.value)}
                >
                  <option value="">不指定</option>
                  {config.menus.map((menu) => (
                    <option key={menu.id} value={menu.id}>
                      {menu.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button disabled={isSavePending} type="submit">
                <Save data-icon="inline-start" />
                {isSavePending ? "保存中..." : "保存位置"}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
          <div className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold">添加菜单项</h2>
            <SourcePanel
              defaultOpen
              items={pages}
              selected={selectedSources.pages}
              setSelected={(selected) => setSelectedSources((current) => ({ ...current, pages: selected }))}
              title="页面"
              onAdd={() => addSelected("pages", pages)}
            />
            <SourcePanel
              items={articles}
              searchable
              selected={selectedSources.articles}
              setSelected={(selected) => setSelectedSources((current) => ({ ...current, articles: selected }))}
              title="文章"
              onAdd={() => addSelected("articles", articles)}
            />
            <SourcePanel
              items={categories}
              selected={selectedSources.categories}
              setSelected={(selected) => setSelectedSources((current) => ({ ...current, categories: selected }))}
              title="分类目录"
              onAdd={() => addSelected("categories", categories)}
            />
            <CustomLinkPanel
              customHref={customHref}
              customLabel={customLabel}
              onAdd={addCustomItem}
              setCustomHref={setCustomHref}
              setCustomLabel={setCustomLabel}
            />
          </div>

          <Card>
            <CardHeader className="border-b border-border">
              <CardTitle>菜单结构</CardTitle>
              <CardDescription>
                拖动左侧手柄可调整顺序；拖到一级菜单项偏右位置可设为二级菜单。子项目会在前台作为下拉项展示。
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5 pt-5">
              {activeMenu ? (
                <>
                  <Field className="max-w-xl">
                    <FieldLabel htmlFor="menuName">菜单名称</FieldLabel>
                    <Input
                      id="menuName"
                      value={activeMenu.name}
                      onChange={(event) => updateActiveMenu((menu) => ({ ...menu, name: event.target.value }))}
                    />
                  </Field>
                  <div className="flex flex-col gap-3">
                    {activeMenu.items.length > 0 ? (
                      activeMenu.items.map((item, index) => (
                        <MenuStructureItem
                          canMoveDown={canMoveMenuItem(activeMenu.items, index, 1)}
                          canMoveUp={canMoveMenuItem(activeMenu.items, index, -1)}
                          canNest={index > 0}
                          dragging={draggingItemId === item.id}
                          dropMode={dropIntent?.targetId === item.id ? dropIntent.mode : null}
                          item={item}
                          key={item.id}
                          moveDown={() => moveItem(item.id, 1)}
                          moveUp={() => moveItem(item.id, -1)}
                          onDragEnd={() => {
                            setDraggingItemId("");
                            setDropIntent(null);
                          }}
                          onDragOver={(event) => previewMenuItemDrop(event, item)}
                          onDragStart={(event) => dragMenuItem(event, item.id)}
                          onDrop={(event) => dropMenuItem(event, item)}
                          remove={() => removeMenuItem(item.id)}
                          update={(patch) => updateMenuItem(item.id, patch)}
                        />
                      ))
                    ) : (
                      <div className="rounded-lg border border-dashed border-border bg-secondary/50 p-8 text-center text-sm text-muted-foreground">
                        当前菜单还没有菜单项，可以从左侧添加页面、文章、分类或自定义链接。
                      </div>
                    )}
                  </div>
                  <form action={saveFormAction} className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
                    <input name="siteMenus" type="hidden" value={serializedConfig} />
                    <input name="saveLabel" type="hidden" value="菜单" />
                    <Button disabled={isSavePending} type="submit">
                      <Save data-icon="inline-start" />
                      {isSavePending ? "保存中..." : "保存菜单"}
                    </Button>
                    <Button onClick={deleteActiveMenu} type="button" variant="outline">
                      <Trash2 data-icon="inline-start" />
                      删除菜单
                    </Button>
                    <span className="text-sm text-muted-foreground">删除或调整后需要点击保存才会同步到前台。</span>
                  </form>
                </>
              ) : (
                <div className="rounded-lg border border-dashed border-border bg-secondary/50 p-8 text-center text-sm text-muted-foreground">
                  请先创建一个菜单。
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function SourcePanel({
  defaultOpen = false,
  items,
  onAdd,
  searchable = false,
  selected,
  setSelected,
  title
}: {
  defaultOpen?: boolean;
  items: MenuSourceItem[];
  onAdd: () => void;
  searchable?: boolean;
  selected: string[];
  setSelected: (selected: string[]) => void;
  title: string;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [keyword, setKeyword] = useState("");
  const normalizedKeyword = keyword.trim().toLowerCase();
  const visibleItems = normalizedKeyword
    ? items.filter((item) => {
        const haystack = `${item.title} ${item.slug} ${item.status ?? ""}`.toLowerCase();

        return haystack.includes(normalizedKeyword);
      })
    : items;

  function toggle(id: string) {
    setSelected(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  }

  return (
    <details
      className="group rounded-md border border-border bg-card text-card-foreground"
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
      open={isOpen}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-6 py-4 text-base font-medium leading-snug">
        <span>{title}</span>
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-4 px-6 pb-6">
        {searchable ? (
          <Field>
            <FieldLabel htmlFor={`menu-source-search-${title}`}>搜索{title}</FieldLabel>
            <Input
              id={`menu-source-search-${title}`}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索文章标题或 Slug"
              value={keyword}
            />
          </Field>
        ) : null}
        <div className="max-h-64 overflow-auto rounded-lg border border-border bg-background p-3">
          {visibleItems.length > 0 ? (
            visibleItems.map((item) => (
              <label className="flex cursor-pointer items-center gap-3 py-2 text-sm" key={item.id}>
                <input checked={selected.includes(item.id)} onChange={() => toggle(item.id)} type="checkbox" />
                <span className="min-w-0 flex-1 truncate">{item.title}</span>
                {item.status ? <Badge variant="outline">{item.status}</Badge> : null}
              </label>
            ))
          ) : (
            <p className="py-5 text-center text-sm text-muted-foreground">
              {items.length > 0 ? "没有匹配项目" : "暂无可添加项目"}
            </p>
          )}
        </div>
        <div className="flex items-center justify-between gap-3">
          <button
            className="text-sm text-muted-foreground hover:text-foreground"
            disabled={visibleItems.length === 0}
            onClick={() => setSelected(Array.from(new Set([...selected, ...visibleItems.map((item) => item.id)])))}
            type="button"
          >
            {searchable && normalizedKeyword ? "全选当前" : "全选"}
          </button>
          <Button disabled={selected.length === 0} onClick={onAdd} type="button" variant="outline">
            添加至菜单
          </Button>
        </div>
      </div>
    </details>
  );
}

function CustomLinkPanel({
  customHref,
  customLabel,
  onAdd,
  setCustomHref,
  setCustomLabel
}: {
  customHref: string;
  customLabel: string;
  onAdd: () => void;
  setCustomHref: (value: string) => void;
  setCustomLabel: (value: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <details
      className="group rounded-md border border-border bg-card text-card-foreground"
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
      open={isOpen}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-6 py-4 text-base font-medium leading-snug">
        <span>自定义链接</span>
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-4 px-6 pb-6">
        <Field>
          <FieldLabel htmlFor="customLabel">链接文字</FieldLabel>
          <Input id="customLabel" value={customLabel} onChange={(event) => setCustomLabel(event.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="customHref">URL</FieldLabel>
          <Input
            id="customHref"
            value={customHref}
            onChange={(event) => setCustomHref(event.target.value)}
            placeholder="/pricing 或 https://example.com"
          />
          <FieldDescription>支持站内路径和 http(s) 站外链接。</FieldDescription>
        </Field>
        <Button className="self-end" onClick={onAdd} type="button" variant="outline">
          添加至菜单
        </Button>
      </div>
    </details>
  );
}

function MenuStructureItem({
  canMoveDown,
  canMoveUp,
  canNest,
  dragging,
  dropMode,
  item,
  moveDown,
  moveUp,
  onDragEnd,
  onDragOver,
  onDragStart,
  onDrop,
  remove,
  update
}: {
  canMoveDown: boolean;
  canMoveUp: boolean;
  canNest: boolean;
  dragging: boolean;
  dropMode: DropMode | null;
  item: SiteMenuItem;
  moveDown: () => void;
  moveUp: () => void;
  onDragEnd: () => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  remove: () => void;
  update: (patch: Partial<SiteMenuItem>) => void;
}) {
  return (
    <details
      className={cn(
        "group rounded-lg border border-border bg-background transition-colors",
        item.depth === 1 && "ml-10",
        dragging && "opacity-50",
        dropMode === "before" && "border-t-4 border-t-primary",
        dropMode === "after" && "border-b-4 border-b-primary",
        dropMode === "child" && "bg-secondary/70 ring-2 ring-primary/40"
      )}
      draggable
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragStart={onDragStart}
      onDrop={onDrop}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-label="拖动调整菜单项"
            className="flex size-8 cursor-grab items-center justify-center rounded-md border border-dashed border-border text-muted-foreground active:cursor-grabbing"
          >
            <GripVertical className="size-4" />
          </span>
          <Link2 className="size-4 text-muted-foreground" />
          <span className="truncate font-semibold">{item.label}</span>
          {item.depth === 1 ? <Badge variant="muted">子项目</Badge> : null}
          {dropMode === "child" ? <Badge variant="secondary">设为二级</Badge> : null}
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>{menuItemTypeLabels[item.type]}</span>
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
        </div>
      </summary>
      <div className="grid gap-4 border-t border-border p-4 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={`${item.id}-label`}>导航标签</FieldLabel>
          <Input id={`${item.id}-label`} value={item.label} onChange={(event) => update({ label: event.target.value })} />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${item.id}-href`}>URL</FieldLabel>
          <Input id={`${item.id}-href`} value={item.href} onChange={(event) => update({ href: event.target.value })} />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${item.id}-type`}>类型</FieldLabel>
          <Select
            id={`${item.id}-type`}
            value={item.type}
            onChange={(event) => update({ type: event.target.value as SiteMenuItemType })}
          >
            {Object.entries(menuItemTypeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <FieldGroup className="flex flex-wrap items-end gap-2">
          <Button disabled={!canMoveUp} onClick={moveUp} type="button" variant="outline">
            <ArrowUp data-icon="inline-start" />
            上移
          </Button>
          <Button disabled={!canMoveDown} onClick={moveDown} type="button" variant="outline">
            <ArrowDown data-icon="inline-start" />
            下移
          </Button>
          <Button disabled={!canNest} onClick={() => update({ depth: item.depth === 1 ? 0 : 1 })} type="button" variant="outline">
            {item.depth === 1 ? (
              <>
                <ArrowLeft data-icon="inline-start" />
                提升层级
              </>
            ) : (
              <>
                <ArrowRight data-icon="inline-start" />
                设为子项
              </>
            )}
          </Button>
          <Button onClick={remove} type="button" variant="outline">
            <Trash2 data-icon="inline-start" />
            移除
          </Button>
        </FieldGroup>
      </div>
    </details>
  );
}

function getDropMode(event: DragEvent<HTMLElement>, targetItem: SiteMenuItem, canCreateChild: boolean): DropMode {
  const rect = event.currentTarget.getBoundingClientRect();
  const offsetX = event.clientX - rect.left;
  const offsetY = event.clientY - rect.top;

  if (targetItem.depth !== 1 && canCreateChild && offsetX > 112) {
    return "child";
  }

  return offsetY < rect.height / 2 ? "before" : "after";
}

function getMenuItemBlockRange(items: SiteMenuItem[], index: number) {
  if (index < 0 || index >= items.length) {
    return null;
  }

  if (items[index]?.depth === 1) {
    return {
      start: index,
      end: index
    };
  }

  let end = index;

  while (end + 1 < items.length && items[end + 1]?.depth === 1) {
    end += 1;
  }

  return {
    start: index,
    end
  };
}

function getParentIndex(items: SiteMenuItem[], childIndex: number) {
  for (let index = childIndex - 1; index >= 0; index -= 1) {
    if (items[index]?.depth !== 1) {
      return index;
    }
  }

  return childIndex;
}

function getRootBlockInsertIndex(items: SiteMenuItem[], targetIndex: number, mode: DropMode) {
  const normalizedMode = mode === "child" ? "after" : mode;
  const target = items[targetIndex];

  if (!target) {
    return items.length;
  }

  if (target.depth === 1) {
    const parentIndex = getParentIndex(items, targetIndex);

    if (normalizedMode === "before") {
      return parentIndex;
    }

    const range = getMenuItemBlockRange(items, parentIndex);

    return range ? range.end + 1 : targetIndex + 1;
  }

  if (normalizedMode === "before") {
    return targetIndex;
  }

  const targetRange = getMenuItemBlockRange(items, targetIndex);

  return targetRange ? targetRange.end + 1 : targetIndex + 1;
}

function getSingleItemInsertIndex(items: SiteMenuItem[], targetIndex: number, mode: DropMode) {
  const target = items[targetIndex];

  if (!target) {
    return items.length;
  }

  if (mode === "child" && target.depth !== 1) {
    const targetRange = getMenuItemBlockRange(items, targetIndex);

    return targetRange ? targetRange.end + 1 : targetIndex + 1;
  }

  if (target.depth !== 1 && mode === "after") {
    const targetRange = getMenuItemBlockRange(items, targetIndex);

    return targetRange ? targetRange.end + 1 : targetIndex + 1;
  }

  return mode === "before" ? targetIndex : targetIndex + 1;
}

function canMoveMenuItem(items: SiteMenuItem[], index: number, direction: -1 | 1) {
  const item = items[index];

  if (!item) {
    return false;
  }

  if (item.depth === 1) {
    return items[index + direction]?.depth === 1;
  }

  const range = getMenuItemBlockRange(items, index);

  if (!range) {
    return false;
  }

  return direction === -1 ? range.start > 0 : range.end < items.length - 1;
}

function normalizeMenuBlockDepth(items: SiteMenuItem[], firstDepth: 0 | 1) {
  return items.map((item, index) => ({
    ...item,
    depth: index === 0 ? firstDepth : 1
  }));
}

function insertMenuBlock(items: SiteMenuItem[], block: SiteMenuItem[], insertIndex: number) {
  const safeIndex = Math.max(0, Math.min(insertIndex, items.length));

  return [...items.slice(0, safeIndex), ...block, ...items.slice(safeIndex)];
}

function sourceHref(type: SiteMenuItemType, slug: string) {
  if (type === "page") {
    return `/pages/${slug}`;
  }

  if (type === "article") {
    return `/articles/${slug}`;
  }

  if (type === "category") {
    return `/articles?category=${encodeURIComponent(slug)}`;
  }

  return "/";
}

function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
