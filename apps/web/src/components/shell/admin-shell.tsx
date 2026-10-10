import Link from "next/link";
import type { ReactNode } from "react";
import { Globe2, LogOut, UserRound } from "lucide-react";

import { AdminSidebar } from "@/components/shell/admin-sidebar";
import { AdminWorkspace } from "@/components/shell/admin-workspace";
import { Button } from "@/components/ui/button";
import { adminLogoutAction, getCurrentAdmin } from "@/lib/auth-actions";
import { adminNavGroups, adminNavItems } from "@/lib/mock-data";
import { getPublicSystemConfigs } from "@/lib/settings-api";

import "@/components/shell/admin-theme.css";

interface AdminShellProps {
  active: string;
  title: string;
  description?: string;
  forceTitle?: boolean;
  children: ReactNode;
}

export async function AdminShell({ active, title, description, forceTitle = false, children }: AdminShellProps) {
  const [admin, configs] = await Promise.all([getCurrentAdmin(), getPublicSystemConfigs().catch(() => [])]);
  const configuredName = configs.find((config) => config.key === "siteName")?.value.trim();
  const brand = configuredName && configuredName !== "AI SaaS" ? configuredName : "阿贝智能";
  const activeNavItem = adminNavItems.find(
    (item) => active === item.href || (item.href !== "/" && item.href !== "/admin" && active.startsWith(`${item.href}/`))
  );
  const displayTitle = forceTitle ? title : activeNavItem?.label ?? title;
  const displayDescription = forceTitle ? description : activeNavItem ? "" : description;
  const group = adminNavGroups.find((item) => item.items.some((nav) => active === nav.href || active.startsWith(`${nav.href}/`)));

  return (
    <AdminWorkspace brand={brand} title={displayTitle} description={displayDescription} group={group?.label} sidebar={<AdminSidebar active={active} />} account={
      <>
              <Button asChild size="sm" variant="outline">
                <Link aria-label="查看前台" href="/">
                  <Globe2 data-icon="inline-start" />
                  <span className="hidden xl:inline">查看前台</span>
                </Link>
              </Button>
              <div className="abei-admin-account" title={admin.email}>
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-primary"><UserRound className="size-4" /></span>
                <div className="hidden max-w-40 sm:block"><p className="truncate text-sm font-semibold">{admin.name || "超级管理员"}</p><p className="truncate text-[11px] text-muted-foreground">{admin.email}</p></div>
              </div>
              <form action={adminLogoutAction}>
                <Button aria-label="退出登录" variant="ghost" size="sm" type="submit">
                  <LogOut data-icon="inline-start" />
                  <span className="hidden xl:inline">退出登录</span>
                </Button>
              </form>
      </>
    }>{children}</AdminWorkspace>
  );
}
