import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { ChevronDown, Menu } from "lucide-react";

import { PublicAuthSessionSync } from "@/components/auth/public-auth-session-sync";
import { LearnerLearningProvider } from "@/components/learning/learner-learning-provider";
import { UserAccountMenu } from "@/components/shell/user-account-menu";
import { learnerNavigationItems } from "@/components/shell/learner-shell";
import { getOptionalCurrentUser, type PublicUser } from "@/lib/auth-actions";
import { getCurrentBillingIdentity } from "@/lib/billing-identity";
import { getWallet } from "@/lib/billing-api";
import {
  getMenuByLocation,
  isExternalHref,
  menuItemsToNavTree,
  parseSiteMenuConfig,
  type NavMenuItem
} from "@/lib/menu-config";
import { getUserOrganizations } from "@/lib/organizations-api";
import {
  enterLearnerAction,
  getProfileSelection,
  getWebProfile,
  returnToAccountAction,
  switchLearnerAction
} from "@/lib/profile-api";
import { getPublicSystemConfigs } from "@/lib/settings-api";
import { getThemeTemplate, themeTemplateStyle } from "@/lib/theme-templates";
import { cn } from "@/lib/utils";

const defaultNavItems = [
  { href: "/", label: "首页" },
  { href: "/center", label: "资源中心" },
  { href: "/tools", label: "场景应用" },
  { href: "/textbook", label: "教材" },
  { href: "/dict", label: "词典" },
  { href: "/articles", label: "文章" },
  { href: "/dashboard", label: "工作台" }
];

const defaultFooterLinks = [
  { href: "/tools", label: "场景应用" },
  { href: "/textbook", label: "电子教材" },
  { href: "/articles", label: "文章" },
  { href: "/pages/about", label: "关于我们" }
];

const experienceNavItems = [
  { href: "/media-tutor", label: "视频导学" },
  { href: "/text2lesson", label: "英文带学" },
  { href: "/gushiwen", label: "学古诗文" },
  { href: "/daodu", label: "开卷导读" },
  { href: "/flashcard", label: "学习闪卡" },
  { href: "/typing", label: "打字记词" },
  { href: "/voice", label: "讲解音频" },
  { href: "/experience/image", label: "图片生成" },
  { href: "/experience/chat", label: "AI 对话" }
];

export async function PublicShell({
  children,
  currentUser,
  brandName,
  primaryNavigation,
  className,
  showHeader = true,
  showFooter = true
}: Readonly<{
  children: ReactNode;
  currentUser?: PublicUser | null;
  brandName?: string;
  primaryNavigation?: Array<{ href: string; label: string }>;
  className?: string;
  showHeader?: boolean;
  showFooter?: boolean;
}>) {
  const [configs, user] = await Promise.all([
    loadPublicConfigMap(),
    currentUser === undefined ? getOptionalCurrentUser() : Promise.resolve(currentUser)
  ]);
  const profile = user ? await getWebProfile("/") : ({ mode: "GUEST" } as const);
  const selection = user && (profile.mode === "ACCOUNT" || profile.mode === "LEARNER")
    ? await getProfileSelection()
    : null;
  const [wallet, organizations] = user && profile.mode === "ACCOUNT"
    ? await Promise.all([
      getWallet().catch(() => null),
      getUserOrganizations().catch(() => null)
    ])
    : [null, null];
  const billingIdentity = user ? await getCurrentBillingIdentity(organizations) : null;
  const billingOrganization =
    billingIdentity?.type === "ORGANIZATION"
      ? organizations?.organizations.find((organization) => organization.id === billingIdentity.organizationId)
      : null;
  const displayedCredits =
    billingIdentity?.type === "ORGANIZATION"
      ? billingOrganization?.quota.remainingQuota ?? billingOrganization?.wallet?.balanceAvailable ?? null
      : wallet?.availableCredits ?? null;
  const siteName = brandName ?? displaySiteName(configs.get("siteName"));
  const siteLogo = safeImageUrl(configs.get("siteLogo"));
  const beianNo = configs.get("beianNo") || "";
  const copyrightText = configs.get("copyrightText") || "";
  const siteMenusValue = configs.get("siteMenus");
  const hasManagedMenus = Boolean(siteMenusValue?.trim());
  const siteMenus = parseSiteMenuConfig(siteMenusValue);
  const primaryMenu = getMenuByLocation(siteMenus, "primary");
  const footerMenu = getMenuByLocation(siteMenus, "footer");
  const publicNavItems = hasManagedMenus
    ? primaryMenu
      ? hideToolApplicationItems(menuItemsToNavTree(primaryMenu.items))
      : []
    : hideToolApplicationItems(parseNavItems(configs.get("publicNavItems"))).filter(
        (item) => !item.href.startsWith("/experience")
      );
  const navItems = profile.mode === "LEARNER"
    ? learnerNavigationItems.map((item) => toNavMenuItem(item))
    : primaryNavigation?.map((item) => toNavMenuItem(item)) ?? publicNavItems;
  const footerLinks = profile.mode === "LEARNER"
    ? []
    : hasManagedMenus
    ? footerMenu
      ? hideToolApplicationItems(menuItemsToNavTree(footerMenu.items))
      : []
    : hideToolApplicationItems(defaultFooterLinks.map((item) => toNavMenuItem(item)));
  const theme = getThemeTemplate(configs.get("activeThemeTemplate"));
  const style = themeTemplateStyle(theme, safeHexColor(configs.get("themePrimaryColor")));

  return (
    <LearnerLearningProvider
      enabled={
        process.env.LEARNER_LEARNING_ENABLED === "1" && profile.mode === "LEARNER"
      }
    >
      <main
        className={cn("xueleai-public-shell min-h-screen bg-background text-foreground", `theme-${theme.key}`, className)}
        data-public-theme={theme.key}
        style={style}
      >
      <PublicAuthSessionSync userId={user?.id} />
      {showHeader ? (
        <header className="xueleai-public-header sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
          <div className="flex h-[4.5rem] w-full items-center justify-between px-5 py-2">
            <Link className="flex min-w-0 items-center gap-3 font-display text-2xl font-semibold tracking-normal" href="/">
              {siteLogo ? (
                <img alt={siteName} className="h-9 w-auto shrink-0 object-contain" src={siteLogo} />
              ) : (
                <>
                  <span className="xueleai-brand-mark">{siteName.startsWith("阿贝") ? "阿" : "学"}</span>
                  <span className="truncate">{siteName}</span>
                </>
              )}
            </Link>
            <nav className="xueleai-public-nav hidden items-center gap-7 text-sm font-medium text-muted-foreground lg:flex">
              {navItems.map((item, index) => (
                <Fragment key={`${item.label}-${item.href}`}>
                  {profile.mode !== "LEARNER" && !primaryNavigation && !hasManagedMenus && index === 1 ? <ExperienceNavMenu /> : null}
                  <HeaderMenuItem item={item} />
                </Fragment>
              ))}
              {profile.mode !== "LEARNER" && !primaryNavigation && !hasManagedMenus && navItems.length <= 1 ? <ExperienceNavMenu /> : null}
            </nav>
            <div className="flex items-center gap-2">
              <MobileNavMenu
                navItems={navItems}
                showExperience={profile.mode !== "LEARNER" && !primaryNavigation}
                showRegister={!user}
              />
              <UserAccountMenu
                availableCredits={displayedCredits}
                billingIdentity={billingIdentity}
                enterLearnerAction={enterLearnerAction}
                loginHref="/login"
                learners={selection?.learners ?? []}
                organizations={organizations}
                profile={profile}
                registerHref="/register"
                returnToAccountAction={returnToAccountAction}
                switchLearnerAction={switchLearnerAction}
                user={user}
              />
            </div>
          </div>
        </header>
      ) : null}
      {children}
      {showFooter ? (
        <footer className="xueleai-public-footer border-t border-border bg-background">
          <div className="flex w-full flex-col items-center gap-4 px-5 py-8 text-center text-sm text-muted-foreground">
            {footerLinks.length > 0 ? (
              <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
                {footerLinks.map((item) => (
                  <FooterMenuItem item={item} key={item.id} />
                ))}
              </nav>
            ) : null}
            {beianNo || copyrightText ? (
              <p className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs">
                {beianNo ? <span>{beianNo}</span> : null}
                {copyrightText ? <span>{copyrightText}</span> : null}
              </p>
            ) : null}
          </div>
        </footer>
      ) : null}
      </main>
    </LearnerLearningProvider>
  );
}

function ExperienceNavMenu() {
  return (
    <div className="group relative">
      <Link className="inline-flex items-center gap-1 hover:text-foreground" href="/experience/chat">
        AI 工具
        <ChevronDown className="transition-transform group-hover:rotate-180" />
      </Link>
      <div className="invisible absolute left-0 top-full z-20 mt-3 grid w-56 grid-cols-1 gap-1 rounded-lg border border-border bg-card p-2 opacity-0 shadow-xl transition-all group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
        {experienceNavItems.map((item) => (
          <Link className="rounded-md px-3 py-2 text-sm font-semibold hover:bg-secondary hover:text-foreground" href={item.href} key={item.href}>
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

function MobileNavMenu({
  navItems,
  showExperience,
  showRegister
}: {
  navItems: NavMenuItem[];
  showExperience: boolean;
  showRegister: boolean;
}) {
  return (
    <details className="group relative lg:hidden">
      <summary className="flex size-10 list-none items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm transition-colors hover:bg-secondary [&::-webkit-details-marker]:hidden">
        <Menu className="size-4" />
        <span className="sr-only">打开导航</span>
      </summary>
      <div className="absolute right-0 top-12 z-50 w-72 rounded-md border border-border bg-background p-2 text-sm shadow-xl">
        <nav className="grid gap-1">
          {navItems.map((item) => (
            <MenuLink
              className="rounded-md px-3 py-2.5 font-semibold hover:bg-secondary"
              item={item}
              key={item.id}
            />
          ))}
        </nav>
        {showExperience ? (
          <div className="mt-2 border-t border-border pt-2">
            <div className="px-3 pb-1 text-xs font-semibold text-muted-foreground">AI 工具</div>
            <div className="grid grid-cols-2 gap-1">
              {experienceNavItems.map((item) => (
                <Link className="rounded-md px-3 py-2 font-semibold hover:bg-secondary" href={item.href} key={item.href}>
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        ) : null}
        {showRegister ? (
          <Link className="mt-2 block rounded-md bg-primary px-3 py-2.5 text-center font-semibold text-primary-foreground" href="/register">
            注册
          </Link>
        ) : null}
      </div>
    </details>
  );
}

function HeaderMenuItem({ item }: { item: NavMenuItem }) {
  if (item.children.length === 0) {
    return <MenuLink className="hover:text-foreground" item={item} />;
  }

  return (
    <div className="group relative">
      <MenuLink className="inline-flex items-center gap-1 hover:text-foreground" item={item}>
        <ChevronDown className="transition-transform group-hover:rotate-180" />
      </MenuLink>
      <div className="invisible absolute left-0 top-full z-20 mt-3 w-48 rounded-lg border border-border bg-card p-2 opacity-0 shadow-sm transition-all group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
        {item.children.map((child) => (
          <MenuLink
            className="flex rounded-md px-3 py-2 text-sm font-medium hover:bg-secondary hover:text-foreground"
            item={child}
            key={child.id}
          />
        ))}
      </div>
    </div>
  );
}

function FooterMenuItem({ item }: { item: NavMenuItem }) {
  return (
    <>
      <MenuLink className="hover:text-foreground" item={item} />
      {item.children.map((child) => (
        <MenuLink className="hover:text-foreground" item={child} key={child.id} />
      ))}
    </>
  );
}

function MenuLink({
  children,
  className,
  item
}: {
  children?: ReactNode;
  className?: string;
  item: NavMenuItem;
}) {
  if (item.external || isExternalHref(item.href)) {
    return (
      <a className={className} href={item.href} rel="noreferrer" target="_blank">
        {item.label}
        {children}
      </a>
    );
  }

  return (
    <Link className={className} href={item.href}>
      {item.label}
      {children}
    </Link>
  );
}

async function loadPublicConfigMap() {
  try {
    const configs = await getPublicSystemConfigs();

    return new Map(configs.map((config) => [config.key, config.value]));
  } catch {
    return new Map<string, string>();
  }
}

function parseNavItems(value: string | undefined) {
  if (!value) {
    return defaultNavItems.map((item) => toNavMenuItem(item));
  }

  const items = value
    .split("\n")
    .map((line) => {
      const [labelInput, hrefInput] = line.split("|");
      const label = String(labelInput ?? "").trim();
      const href = String(hrefInput ?? "").trim();

      return label && isSafeInternalHref(href) ? toNavMenuItem({ href, label }) : null;
    })
    .filter((item): item is NavMenuItem => Boolean(item))
    .slice(0, 12);

  return items.length > 0 ? items : defaultNavItems.map((item) => toNavMenuItem(item));
}

function toNavMenuItem(item: { href: string; label: string }): NavMenuItem {
  return {
    id: `${item.label}-${item.href}`,
    label: item.label,
    href: item.href,
    external: isExternalHref(item.href),
    children: []
  };
}

function hideToolApplicationItems(items: NavMenuItem[]): NavMenuItem[] {
  return items
    .filter((item) => !isToolApplicationHref(item.href))
    .map((item) => ({
      ...item,
      href: item.label === "绘本馆" && item.href === "/center" ? "/library" : item.href,
      children: hideToolApplicationItems(item.children)
    }));
}

function isToolApplicationHref(href: string) {
  return href === "/tools" || href.startsWith("/tools/");
}

function safeHexColor(value: string | undefined) {
  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : undefined;
}

function displaySiteName(value: string | undefined) {
  const normalized = value?.trim();

  return !normalized || normalized === "AI SaaS" ? "学乐 AI" : normalized;
}

function safeImageUrl(value: string | undefined) {
  const normalized = value?.trim();

  if (!normalized) {
    return "";
  }

  if (normalized.startsWith("/") && !normalized.startsWith("//")) {
    return normalized;
  }

  if (/^https?:\/\//i.test(normalized)) {
    return normalized;
  }

  return "";
}

function isSafeInternalHref(value: string) {
  return (
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("<") &&
    !value.includes(">") &&
    !value.toLowerCase().includes("javascript:")
  );
}
