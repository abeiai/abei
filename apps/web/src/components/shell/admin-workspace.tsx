"use client";

import Link from "next/link";
import { ChevronRight, Home, Menu, Plus, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

interface AdminWorkspaceProps {
  brand: string;
  title: string;
  description?: string;
  group?: string;
  sidebar: ReactNode;
  account: ReactNode;
  children: ReactNode;
}

export function AdminWorkspace({ brand, title, description, group, sidebar, account, children }: AdminWorkspaceProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);

  function closeMobileNavigation() {
    setMobileOpen(false);
    requestAnimationFrame(() => menuRef.current?.focus());
  }

  useEffect(() => {
    if (!mobileOpen) return;
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => { if (desktop.matches) setMobileOpen(false); };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sidebarRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    desktop.addEventListener("change", closeOnDesktop);
    return () => {
      document.body.style.overflow = previousOverflow;
      desktop.removeEventListener("change", closeOnDesktop);
    };
  }, [mobileOpen]);

  return (
    <main className="xueleai-admin-shell abei-admin-theme">
      <div className="abei-admin-frame" data-sidebar-collapsed={collapsed} data-mobile-nav-open={mobileOpen}>
        {mobileOpen ? <button aria-label="关闭导航遮罩" className="abei-admin-backdrop" onClick={closeMobileNavigation} type="button" /> : null}
        <aside
          className="abei-admin-sidebar"
          id="admin-navigation"
          ref={sidebarRef}
          onKeyDown={(event) => {
            if (!mobileOpen) return;
            if (event.key === "Escape") { event.preventDefault(); closeMobileNavigation(); }
            if (event.key !== "Tab") return;
            const items = sidebarRef.current?.querySelectorAll<HTMLElement>("a[href], button:not(:disabled)");
            const first = items?.[0];
            const last = items?.[items.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
          }}
        >
          <div className="abei-admin-brand">
            <Link className="flex min-w-0 items-center gap-3" href="/admin">
              <span className="abei-admin-brand-mark">A</span>
              <span className="truncate text-lg font-semibold">{brand}</span>
            </Link>
            <Button aria-label="关闭导航" className="size-9 px-0 lg:hidden" onClick={closeMobileNavigation} type="button" variant="ghost"><X /></Button>
          </div>
          <div className="abei-admin-sidebar-scroll">{sidebar}</div>
          <div className="abei-admin-sidebar-footer"><span className="size-1.5 rounded-full bg-emerald-500" />管理控制台</div>
        </aside>
        <section className="abei-admin-main" inert={mobileOpen}>
          <header className="abei-admin-topbar">
            <div className="flex min-w-0 items-center gap-3">
              <Button aria-controls="admin-navigation" aria-expanded={!collapsed} aria-label={collapsed ? "展开侧栏" : "收起侧栏"} className="hidden size-9 px-0 lg:inline-flex" onClick={() => setCollapsed(!collapsed)} type="button" variant="outline"><Menu /></Button>
              <Button aria-controls="admin-navigation" aria-expanded={mobileOpen} aria-label="打开导航" className="size-9 px-0 lg:hidden" onClick={() => setMobileOpen(true)} ref={menuRef} type="button" variant="outline"><Menu /></Button>
              <span className="text-sm font-medium text-muted-foreground">管理后台</span>
              <Button asChild className="hidden sm:inline-flex" size="sm" variant="outline"><Link href="/admin/articles/new"><Plus />新建文章</Link></Button>
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">{account}</div>
          </header>
          <div className="abei-admin-content">
            <div className="abei-admin-page-heading">
              <div><h1 className="text-xl font-semibold tracking-normal">{title}</h1>{description ? <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p> : null}</div>
              <nav aria-label="面包屑" className="flex items-center gap-2 text-xs text-muted-foreground">
                <Link aria-label="后台首页" href="/admin"><Home className="size-3.5" /></Link>
                {group ? <><ChevronRight className="size-3" /><span>{group}</span></> : null}
                <ChevronRight className="size-3" /><span aria-current="page" className="text-foreground">{title}</span>
              </nav>
            </div>
            {children}
          </div>
          <footer className="abei-admin-footer"><span>© {new Date().getFullYear()} {brand}</span><span>管理控制台</span></footer>
        </section>
      </div>
    </main>
  );
}
