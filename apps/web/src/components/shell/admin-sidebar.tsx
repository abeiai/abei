"use client";

import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";

import {
  adminFrontendNavItem,
  adminHomeNavItem,
  adminNavGroups,
  type AdminNavGroup,
  type AdminNavItem
} from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface AdminSidebarProps {
  active: string;
}

function isNavItemActive(active: string, item: AdminNavItem) {
  return active === item.href || (item.href !== "/admin" && active.startsWith(`${item.href}/`));
}

function isNavGroupActive(active: string, group: AdminNavGroup) {
  return group.items.some((item) => isNavItemActive(active, item));
}

function activeGroupKeys(active: string) {
  return adminNavGroups.filter((group) => isNavGroupActive(active, group)).map((group) => group.key);
}

function AdminSidebarLink({ active, item, nested = false }: { active: string; item: AdminNavItem; nested?: boolean }) {
  const isActive = isNavItemActive(active, item);

  return (
    <Button
      asChild
      className={cn(
        "abei-admin-nav-link min-h-10 w-full justify-start rounded-md px-3 font-medium text-muted-foreground",
        nested && "min-h-9 text-[13px]",
        isActive && "bg-secondary text-primary"
      )}
      variant="ghost"
    >
      <Link aria-current={isActive ? "page" : undefined} href={item.href}>
        <item.icon data-icon="inline-start" />
        <span className="truncate">{item.label}</span>
      </Link>
    </Button>
  );
}

export function AdminSidebar({ active }: AdminSidebarProps) {
  const [openGroupKeys, setOpenGroupKeys] = useState<string[]>(() => activeGroupKeys(active));

  useEffect(() => {
    const keys = activeGroupKeys(active);

    if (keys.length === 0) {
      return;
    }

    setOpenGroupKeys((current) => [...new Set([...current, ...keys])]);
  }, [active]);

  const toggleGroup = (key: string) => {
    setOpenGroupKeys((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  };

  return (
    <nav aria-label="后台导航" className="flex flex-col gap-1 px-4 py-5">
      <p className="abei-admin-nav-caption">工作空间</p>
      <AdminSidebarLink active={active} item={adminHomeNavItem} />
      <p className="abei-admin-nav-caption mt-5">管理应用</p>

      {adminNavGroups.map((group) => {
        const isOpen = openGroupKeys.includes(group.key);
        const isActive = isNavGroupActive(active, group);
        const contentId = `admin-nav-group-${group.key}`;

        return (
          <div className="flex flex-col gap-1" key={group.key}>
            <Button
              aria-controls={contentId}
              aria-expanded={isOpen}
              className={cn(
                "abei-admin-nav-link min-h-11 w-full justify-between rounded-md px-3 font-medium text-muted-foreground",
                isActive && "text-primary"
              )}
              onClick={() => toggleGroup(group.key)}
              type="button"
              variant="ghost"
            >
              <span className="flex min-w-0 items-center gap-3">
                <group.icon data-icon="inline-start" />
                <span className="truncate">{group.label}</span>
              </span>
              {isOpen ? <ChevronDown aria-hidden="true" className="size-3.5" /> : <ChevronRight aria-hidden="true" className="size-3.5" />}
            </Button>

            {isOpen ? (
              <div className="ml-5 flex flex-col gap-1 border-l border-border pl-3" id={contentId}>
                {group.items.map((item) => (
                  <AdminSidebarLink active={active} item={item} key={item.href} nested />
                ))}
              </div>
            ) : null}
          </div>
        );
      })}

      <div className="pt-2">
        <AdminSidebarLink active={active} item={adminFrontendNavItem} />
      </div>
    </nav>
  );
}
