"use client";

import Link from "next/link";
import { Minus, Plus } from "lucide-react";
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
        "min-h-11 w-full justify-start rounded-lg px-3 text-muted-foreground",
        nested && "min-h-10 text-[13px]",
        isActive && "border border-primary/15 bg-secondary text-foreground shadow-sm"
      )}
      variant="ghost"
    >
      <Link href={item.href}>
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
    <nav className="flex flex-col gap-1 p-4">
      <AdminSidebarLink active={active} item={adminHomeNavItem} />

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
                "min-h-11 w-full justify-between rounded-lg px-3 text-muted-foreground",
                isActive && "border border-primary/15 bg-secondary text-foreground shadow-sm"
              )}
              onClick={() => toggleGroup(group.key)}
              type="button"
              variant="ghost"
            >
              <span className="flex min-w-0 items-center gap-3">
                <group.icon data-icon="inline-start" />
                <span className="truncate">{group.label}</span>
              </span>
              {isOpen ? <Minus aria-hidden="true" data-icon="inline-end" /> : <Plus aria-hidden="true" data-icon="inline-end" />}
            </Button>

            {isOpen ? (
              <div className="ml-3 flex flex-col gap-1 border-l border-border pl-3" id={contentId}>
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
