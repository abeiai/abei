import type { ReactNode } from "react";

import { DashboardAccountLayout } from "@/components/shell/dashboard-account-layout";
import { PublicShell } from "@/components/shell/public-shell";
import { getCurrentUser } from "@/lib/auth-actions";
import { getUserOrganizations } from "@/lib/organizations-api";
import { requireAccountProfile } from "@/lib/profile-api";

export type DashboardNavKey =
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

export const dashboardNavItems: DashboardNavItem[] = [
  {
    key: "overview",
    href: "/dashboard",
    label: "账号总览"
  },
  {
    key: "courses",
    href: "/dashboard/courses",
    label: "课程编排"
  },
  {
    key: "billing",
    href: "/dashboard/billing",
    label: "账单明细"
  },
  {
    key: "organizations",
    href: "/dashboard/organizations",
    label: "组织账号"
  },
  {
    key: "knowledge",
    href: "/dashboard/learners",
    label: "学习账号",
    children: [
      { href: "/dashboard/learners", label: "账号管理" },
      { href: "/dashboard/learners/data", label: "学习数据" },
      { href: "/dashboard/learners/resources", label: "资源授权" },
      { href: "/dashboard/learners/apps", label: "应用授权" }
    ]
  },
  {
    key: "profile",
    href: "/dashboard/profile",
    label: "个人资料",
    children: [
      { href: "/dashboard/profile", label: "个人资料" },
      { href: "/account/connections", label: "已连接客户端" }
    ]
  }
];

export async function DashboardShell({
  active,
  activeHref,
  children,
  continuation
}: Readonly<{
  active: DashboardNavKey;
  activeHref?: string;
  children: ReactNode;
  continuation: string;
}>) {
  await requireAccountProfile(continuation);
  const [user, organizationResult] = await Promise.all([
    getCurrentUser(),
    getUserOrganizations().catch(() => null)
  ]);
  const visibleNavItems = dashboardNavItems.filter(
    (item) => item.key !== "organizations" || organizationResult?.enabled
  );

  return (
    <PublicShell currentUser={user} showFooter={false}>
      <DashboardAccountLayout
        active={active}
        activeHref={activeHref ?? continuation}
        navItems={visibleNavItems}
      >
        {children}
      </DashboardAccountLayout>
    </PublicShell>
  );
}
