import Link from "next/link";
import type { ReactNode } from "react";
import { Globe2, LogOut } from "lucide-react";

import { AdminSidebar } from "@/components/shell/admin-sidebar";
import { Button } from "@/components/ui/button";
import { adminLogoutAction, getCurrentAdmin } from "@/lib/auth-actions";
import { adminNavItems } from "@/lib/mock-data";

interface AdminShellProps {
  active: string;
  title: string;
  description?: string;
  forceTitle?: boolean;
  children: ReactNode;
}

export async function AdminShell({ active, title, description, forceTitle = false, children }: AdminShellProps) {
  const admin = await getCurrentAdmin();
  const activeNavItem = adminNavItems.find(
    (item) => active === item.href || (item.href !== "/" && item.href !== "/admin" && active.startsWith(`${item.href}/`))
  );
  const displayTitle = forceTitle ? title : activeNavItem?.label ?? title;
  const displayDescription = forceTitle ? description : activeNavItem ? "" : description;

  return (
    <main className="xueleai-admin-shell min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen lg:grid-cols-[260px_1fr]">
        <aside className="xueleai-sidebar-surface border-b border-border bg-card lg:border-b-0 lg:border-r">
          <div className="flex h-16 items-center justify-between border-b border-border px-5">
            <Link className="flex items-center gap-3 font-display text-xl font-semibold" href="/admin">
              <span className="xueleai-brand-mark size-8 text-base">学</span>
              学乐 AI
            </Link>
            <span className="rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-semibold">
              管理端
            </span>
          </div>
          <AdminSidebar active={active} />
        </aside>
        <section className="flex min-w-0 flex-col">
          <header className="flex min-h-16 flex-col gap-4 border-b border-border bg-card/70 px-5 py-4 backdrop-blur md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-medium tracking-normal">{displayTitle}</h1>
              {displayDescription ? <p className="text-sm text-muted-foreground">{displayDescription}</p> : null}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild size="sm" variant="outline">
                <Link href="/">
                  <Globe2 data-icon="inline-start" />
                  查看前台
                </Link>
              </Button>
              <div className="rounded-full border border-border bg-card px-4 py-2 text-sm">
                {admin.name || "超级管理员"} · {admin.email}
              </div>
              <form action={adminLogoutAction}>
                <Button variant="outline" size="sm" type="submit">
                  <LogOut data-icon="inline-start" />
                  退出登录
                </Button>
              </form>
            </div>
          </header>
          <div className="p-5 md:p-8">{children}</div>
        </section>
      </div>
    </main>
  );
}
