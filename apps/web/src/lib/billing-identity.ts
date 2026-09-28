"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { getUserOrganizations, type UserOrganizationsResult } from "@/lib/organizations-api";

export interface BillingIdentity {
  type: "PERSONAL" | "ORGANIZATION";
  organizationId: string | null;
  label: string;
}

export interface BillingIdentityActionResult {
  ok: boolean;
  message?: string;
}

const billingIdentityCookie = "xueleai_billing_identity";
const personalIdentity: BillingIdentity = {
  type: "PERSONAL",
  organizationId: null,
  label: "个人账号"
};

function shouldUseSecureCookies() {
  const appBaseUrl = process.env.APP_BASE_URL?.trim().toLowerCase();

  if (appBaseUrl) {
    return appBaseUrl.startsWith("https://");
  }

  return process.env.NODE_ENV === "production";
}

function activeOrganizations(organizations: UserOrganizationsResult | null | undefined) {
  return organizations?.enabled
    ? organizations.organizations.filter((organization) => organization.memberStatus === "ACTIVE")
    : [];
}

export async function getCurrentBillingIdentity(
  organizations: UserOrganizationsResult | null | undefined
): Promise<BillingIdentity> {
  const cookieStore = await cookies();
  const rawValue = cookieStore.get(billingIdentityCookie)?.value ?? "";
  const selectedOrganizationId = rawValue.startsWith("org:") ? rawValue.slice(4) : "";

  if (!selectedOrganizationId) {
    return personalIdentity;
  }

  const organization = activeOrganizations(organizations).find((item) => item.id === selectedOrganizationId);

  if (!organization) {
    return personalIdentity;
  }

  return {
    type: "ORGANIZATION",
    organizationId: organization.id,
    label: organization.name
  };
}

export async function switchBillingIdentityAction(formData: FormData): Promise<BillingIdentityActionResult> {
  const requestedIdentity = String(formData.get("identity") ?? "").trim();
  const cookieStore = await cookies();

  if (!requestedIdentity || requestedIdentity === "personal") {
    cookieStore.delete(billingIdentityCookie);
    revalidatePath("/", "layout");

    return { ok: true };
  }

  if (!requestedIdentity.startsWith("org:")) {
    return { ok: false, message: "登录身份参数无效。" };
  }

  const organizationId = requestedIdentity.slice(4);
  const organizations = await getUserOrganizations().catch(() => null);
  const organization = activeOrganizations(organizations).find((item) => item.id === organizationId);

  if (!organization) {
    return { ok: false, message: "无法切换到该企业身份，请确认企业账号仍可用。" };
  }

  cookieStore.set(billingIdentityCookie, `org:${organization.id}`, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
    secure: shouldUseSecureCookies()
  });
  revalidatePath("/", "layout");

  return { ok: true };
}
