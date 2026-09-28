import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { registerHooks } from "node:module";
import * as React from "react";

interface GuardMocks {
  events: string[];
  guardPromise: Promise<unknown>;
  redirects: string[];
}

declare global {
  var __dashboardGuardMocks: GuardMocks;
}

(globalThis as typeof globalThis & { React: typeof React }).React = React;
globalThis.__dashboardGuardMocks = createMocks();

registerHooks({
  resolve(specifier, context, nextResolve) {
    const sources: Record<string, string> = {
      "@/components/shell/admin-shell": "export function AdminShell({children}){return children}",
      "@/components/admin/membership-manager": "export function MembershipManager(){return null}",
      "@/components/shell/public-shell": "export function PublicShell({children}){return children}",
      "@/components/shell/dashboard-account-layout": "export function DashboardAccountLayout({children}){return children}",
      "@/lib/profile-api": `
        export async function requireAccountProfile(next) {
          globalThis.__dashboardGuardMocks.events.push('guard:' + next);
          return globalThis.__dashboardGuardMocks.guardPromise;
        }
        export async function getLearners() {
          return [];
        }
      `,
      "@/lib/auth-actions": `
        export async function getCurrentAdmin() {
          globalThis.__dashboardGuardMocks.events.push('admin-guard');
          return globalThis.__dashboardGuardMocks.guardPromise;
        }

        export async function getCurrentUser() {
          globalThis.__dashboardGuardMocks.events.push('user');
          return {id:'user-1',email:'user@example.com',phone:null,nickname:'用户',avatarUrl:null,status:'ACTIVE'};
        }
      `,
      "@/lib/billing-api": `
        export async function getWallet() {
          globalThis.__dashboardGuardMocks.events.push('wallet');
          return {availableCredits:0,frozenCredits:0,totalTopUpCredits:0,totalConsumedCredits:0};
        }
        export async function getLedger() {
          globalThis.__dashboardGuardMocks.events.push('ledger');
          return [];
        }
      `,
      "@/lib/membership-api": `
        export async function getAdminMemberships() {
          globalThis.__dashboardGuardMocks.events.push('admin-plans'); return [];
        }
        export async function getMembershipSettings() {
          globalThis.__dashboardGuardMocks.events.push('admin-settings'); return {freeLearnerLimit:1};
        }

        export async function getMyMembership() {
          globalThis.__dashboardGuardMocks.events.push('membership');
          return {current:null,upcoming:[],membershipCredits:0};
        }
      `,
      "@/lib/ai-api": `
        export async function getAiTasks() {
          globalThis.__dashboardGuardMocks.events.push('ai-tasks');
          return [];
        }
        export function parseHistoryProfileFilter() {
          return 'all';
        }
        export function historyProfileFilterGroups() {
          return [{label:null,options:[{label:'全部',value:'all'}]}];
        }
      `,
      "@/lib/audio-api": `
        export async function getAudioTasks() {
          globalThis.__dashboardGuardMocks.events.push('audio-tasks');
          return [];
        }
      `,
      "@/lib/organizations-api": `
        export async function getUserOrganizations() {
          globalThis.__dashboardGuardMocks.events.push('organizations');
          return {enabled:false,organizations:[]};
        }
      `
    };
    const source = sources[specifier];

    if (source !== undefined) {
      return { shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(source)}` };
    }
    if (specifier === "next/headers") {
      return {
        shortCircuit: true,
        url: "data:text/javascript,export async function cookies(){return {getAll(){return [{name:'xueleai_user_access',value:'access'}]}}};export async function headers(){return new Headers()}"
      };
    }
    if (specifier === "next/cache") {
      return {
        shortCircuit: true,
        url: "data:text/javascript,export function revalidatePath(){}"
      };
    }
    if (specifier === "next/navigation") {
      return {
        shortCircuit: true,
        url: "data:text/javascript,export function redirect(path){globalThis.__dashboardGuardMocks.redirects.push(path);throw Object.assign(new Error('NEXT_REDIRECT'),{destination:path})};export function useRouter(){return {refresh(){}}}"
      };
    }
    return nextResolve(specifier, context);
  }
});

const { default: AdminMembershipsPage } = await import("../src/app/admin/memberships/page.js");
const { default: DashboardPage } = await import("../src/app/dashboard/page.js");
const { default: BillingPage } = await import("../src/app/dashboard/billing/page.js");
const { DashboardShell } = await import("../src/components/shell/dashboard-shell.js");
const profileApi = await import("../src/lib/profile-api.js");
const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.__dashboardGuardMocks = createMocks();
});

after(() => {
  globalThis.fetch = originalFetch;
});

test("账号总览在主账号守卫完成前不读取用户、钱包或任务", async () => {
  let releaseGuard: ((value: unknown) => void) | undefined;
  globalThis.__dashboardGuardMocks.guardPromise = new Promise((resolve) => {
    releaseGuard = resolve;
  });

  const render = DashboardPage();
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(globalThis.__dashboardGuardMocks.events, ["guard:/dashboard"]);
  releaseGuard?.([]);
  await render;
  assert.deepEqual(globalThis.__dashboardGuardMocks.events, [
    "guard:/dashboard",
    "user",
    "wallet",
    "ai-tasks",
    "audio-tasks"
  ]);
});

test("账单页只先解析查询参数并在主账号守卫后读取账单", async () => {
  let releaseGuard: ((value: unknown) => void) | undefined;
  globalThis.__dashboardGuardMocks.guardPromise = new Promise((resolve) => {
    releaseGuard = resolve;
  });

  const render = BillingPage({ searchParams: Promise.resolve({ view: "consume" }) });
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(globalThis.__dashboardGuardMocks.events, ["guard:/dashboard/billing"]);
  releaseGuard?.([]);
  await render;
  assert.equal(globalThis.__dashboardGuardMocks.events[0], "guard:/dashboard/billing");
  assert.ok(globalThis.__dashboardGuardMocks.events.includes("wallet"));
  assert.ok(globalThis.__dashboardGuardMocks.events.includes("ledger"));
  assert.ok(globalThis.__dashboardGuardMocks.events.includes("membership"));
});

test("DashboardShell 将调用方的精确 continuation 传给服务端哨兵", async () => {
  await DashboardShell({
    active: "knowledge",
    children: React.createElement("div"),
    continuation: "/dashboard/learners"
  });

  assert.equal(globalThis.__dashboardGuardMocks.events[0], "guard:/dashboard/learners");
});

test("真实守卫保留安全路径并清洗恶意 continuation", async () => {
  const cases: Array<[number, string, string, string]> = [
    [403, "请先选择使用身份", "/dashboard/learners", "/select-profile?next=%2Fdashboard%2Flearners"],
    [401, "登录状态已失效，请重新登录", "/dashboard/billing", "/login?next=%2Fdashboard%2Fbilling"],
    [403, "请切换到主账号身份后操作", "/dashboard/tasks/task-1", "/learn"],
    [403, "请先选择使用身份", "https://evil.example/path", "/select-profile"]
  ];

  for (const [status, message, continuation, destination] of cases) {
    globalThis.fetch = async () => apiResponse(status, null, message);
    await assert.rejects(
      profileApi.requireAccountProfile(continuation),
      (error: Error & { destination?: string }) => error.destination === destination
    );
  }
});

function createMocks(): GuardMocks {
  return { events: [], guardPromise: Promise.resolve([]), redirects: [] };
}

function apiResponse(status: number, data: unknown, message: string) {
  return new Response(
    JSON.stringify({ code: status < 400 ? 0 : status * 100 + 1, message, data }),
    { status, headers: { "Content-Type": "application/json" } }
  );
}


test("会员管理页在管理员守卫结束前不请求管理数据", async () => {
  let releaseGuard: ((value: unknown) => void) | undefined;
  globalThis.__dashboardGuardMocks.guardPromise = new Promise((resolve) => { releaseGuard = resolve; });
  const render = AdminMembershipsPage();
  await Promise.resolve();
  assert.deepEqual(globalThis.__dashboardGuardMocks.events, ["admin-guard"]);
  releaseGuard?.({id:"admin"});
  await render;
  assert.deepEqual(globalThis.__dashboardGuardMocks.events, ["admin-guard", "admin-plans", "admin-settings"]);
});
