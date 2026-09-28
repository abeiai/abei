"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import {
  Building2,
  Coins,
  LayoutDashboard,
  LibraryBig,
  PanelLeftClose,
  PanelLeftOpen,
  UserRound,
  type LucideIcon
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DashboardNavKey =
  | "overview"
  | "ai"
  | "knowledge"
  | "video-guides"
  | "courses"
  | "tasks"
  | "voices"
  | "billing"
  | "organizations"
  | "profile";

type DashboardNavItem = {
  key: DashboardNavKey;
  href: string;
  label: string;
  children?: Array<{
    href: string;
    label: string;
  }>;
};

const sidebarStorageKey = "xueleai:dashboard-sidebar-collapsed";
const navIcons: Partial<Record<DashboardNavKey, LucideIcon>> = {
  overview: LayoutDashboard,
  courses: LibraryBig,
  billing: Coins,
  organizations: Building2,
  profile: UserRound
};

export function DashboardAccountLayout({
  active,
  activeHref,
  children,
  navItems
}: {
  active: DashboardNavKey;
  activeHref?: string;
  children: ReactNode;
  navItems: DashboardNavItem[];
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const activeItem = navItems.find((item) => item.key === active);

  useEffect(() => {
    setSidebarCollapsed(window.localStorage.getItem(sidebarStorageKey) === "1");
  }, []);

  function toggleSidebar() {
    setSidebarCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(sidebarStorageKey, next ? "1" : "0");

      return next;
    });
  }

  return (
    <div
      className={cn(
        "grid w-full bg-[#f6f6f5] md:min-h-[calc(100vh-4.5rem)]",
        sidebarCollapsed ? "md:grid-cols-[76px_minmax(0,1fr)]" : "md:grid-cols-[292px_minmax(0,1fr)]"
      )}
    >
      <aside className="xueleai-sidebar-surface border-b border-border bg-background md:border-b-0 md:border-r">
        <div className="sticky top-[4.5rem] flex flex-col">
          <div
            className={cn(
              "flex h-16 shrink-0 items-center",
              sidebarCollapsed ? "justify-center px-0" : "justify-between px-5"
            )}
          >
            {!sidebarCollapsed ? (
              <Link className="flex min-w-0 items-center gap-2 font-display text-2xl font-light tracking-normal" href="/dashboard">
                <UserRound className="size-7" />
                <span className="truncate">我的账号</span>
              </Link>
            ) : null}
            <Button
              aria-label={sidebarCollapsed ? "展开左栏" : "收起左栏"}
              className={cn("hidden px-0 md:inline-flex", sidebarCollapsed ? "size-8" : "size-9")}
              onClick={toggleSidebar}
              type="button"
              variant="ghost"
            >
              {sidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            </Button>
          </div>
          <nav className={cn("flex gap-2 overflow-x-auto px-5 pb-4 md:flex-col md:overflow-visible", sidebarCollapsed && "md:px-3")}>
            {navItems.map((item) => {
              const Icon = navIcons[item.key] ?? UserRound;
              const isActive = item.key === active;

              return (
                <div className="min-w-[136px] md:min-w-0" key={item.key}>
                  <Link
                    aria-label={sidebarCollapsed ? item.label : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-md border border-transparent px-0 py-2.5 text-sm transition-colors",
                      sidebarCollapsed && "md:justify-center md:px-0",
                      isActive
                        ? "border-border bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-background hover:text-foreground"
                    )}
                    href={item.href}
                    title={sidebarCollapsed ? item.label : undefined}
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center">
                      <Icon className="size-5" />
                    </span>
                    {!sidebarCollapsed ? <span className="truncate font-medium">{item.label}</span> : null}
                  </Link>
                  {item.children?.length && !sidebarCollapsed ? (
                    <div className="mt-1 flex gap-1 pl-4 md:flex-col md:pl-10">
                      {item.children.map((child) => {
                        const childActive = activeHref === child.href;

                        return (
                          <Link
                            aria-current={childActive ? "page" : undefined}
                            className={cn(
                              "rounded-md px-3 py-2 text-xs font-medium transition-colors",
                              childActive
                                ? "bg-secondary text-foreground"
                                : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
                            )}
                            href={child.href}
                            key={child.href}
                          >
                            {child.label}
                          </Link>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </nav>
        </div>
      </aside>
      <div className="min-w-0 bg-background">
        <h1 className="sr-only">{activeItem?.label ?? "用户中心"}</h1>
        {children}
      </div>
    </div>
  );
}
