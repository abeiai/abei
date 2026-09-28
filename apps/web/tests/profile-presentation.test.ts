import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import test from "node:test";
import * as React from "react";

import { learnerHomeModel } from "../src/components/profiles/learner-home.js";
import { profileSwitcherTargets } from "../src/components/profiles/profile-switcher.js";
import { profileSelectionCards } from "../src/components/profiles/profile-selector.js";
import { learnerNavigationItems } from "../src/components/shell/learner-shell.js";
import * as learnerShellModule from "../src/components/shell/learner-shell.js";
import {
  loginHrefForCurrentPage,
  profileIdentityPresentation
} from "../src/components/shell/user-account-menu.js";
import { accountProfileIdentityRows } from "../src/lib/user-identity.js";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

declare global {
  var __task4PageMocks: {
    learners?: { status: string }[];
    events: string[];
    userContinuations: unknown[];
    userPromise: Promise<unknown>;
  };
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    const sources: Record<string, string> = {
      "@/components/profiles/profile-selector":
        "export function ProfileSelector(){return null}",
      "@/lib/auth-actions":
        "export async function getCurrentUser(next){globalThis.__task4PageMocks.events.push('user');globalThis.__task4PageMocks.userContinuations.push(next);return globalThis.__task4PageMocks.userPromise}",
      "@/lib/profile-api":
        "export async function getProfileSelection(){globalThis.__task4PageMocks.events.push('selection');return {account:{},learners:globalThis.__task4PageMocks.learners??[]}};export async function selectInitialAccountProfile(){throw new Error('页面渲染不得修改身份会话')}",
      "@/lib/profile-routing":
        "export function profileContinuationPath(value){return value==='/text2lesson'?value:null}"
    };
    const source = sources[specifier];

    return source === undefined
      ? nextResolve(specifier, context)
      : { shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(source)}` };
  }
});

const { default: SelectProfilePage } = await import("../src/app/select-profile/page.js");

test("账号卡片始终第一且停用学习者不会展示", () => {
  const cards = profileSelectionCards({
    account: {
      id: "user-1",
      accountId: "10000",
      label: "我的账号",
      nickname: "主账号",
      avatarUrl: null,
      hasLoginPassword: true
    },
    learners: [
      learner({ id: "inactive", nickname: "停用", status: "INACTIVE" }),
      learner({ id: "active", nickname: "小明", status: "ACTIVE" })
    ]
  });

  assert.deepEqual(cards.map((card) => [card.mode, card.learnerId]), [
    ["ACCOUNT", null],
    ["LEARNER", "active"]
  ]);
  assert.equal(cards[0]?.label, "我的账号");
  assert.equal(cards[0]?.accountId, "10000");
  assert.equal(cards[1]?.accountId, "100");
});

test("个人资料在昵称上方展示主账号 ID", () => {
  assert.deepEqual(accountProfileIdentityRows({ accountId: "10000", nickname: "主账号" }), [
    { key: "accountId", label: "主账号 ID", value: "10000" },
    { key: "nickname", label: "昵称", value: "主账号" }
  ]);
});

test("头像缺失时使用昵称首字符且保留 API 学段标签", () => {
  const cards = profileSelectionCards({
    account: {
      id: "user-1",
      accountId: "10000",
      label: "我的账号",
      nickname: "账号",
      avatarUrl: null,
      hasLoginPassword: true
    },
    learners: [
      learner({
        id: "learner-1",
        nickname: "大学生",
        avatarUrl: null,
        grade: "UNIVERSITY_OR_WORK",
        gradeLabel: "大学和工作",
        status: "ACTIVE"
      })
    ]
  });

  assert.equal(cards[0]?.avatarFallback, "账");
  assert.equal(cards[1]?.avatarFallback, "大");
  assert.equal(cards[1]?.gradeLabel, "大学和工作");
});

test("学习者导航只包含三个学习入口", () => {
  assert.deepEqual(
    learnerNavigationItems.map((item) => [item.label, item.href]),
    [
      ["学习首页", "/learn"],
      ["场景应用", "/tools"],
      ["我的课程", "/learn#courses"]
    ]
  );
  const labels: readonly string[] = learnerNavigationItems.map((item) => item.label);
  for (const forbidden of ["账单明细", "组织账号", "个人资料", "学习账号", "课程编排"]) {
    assert.equal(labels.includes(forbidden), false);
  }
});

test("学习者页头提供头像左侧的学习中心入口", () => {
  const actions = (learnerShellModule as unknown as {
    learnerHeaderActions?: Array<{ label: string; href: string }>;
  }).learnerHeaderActions;

  assert.deepEqual(actions, [{ label: "学习中心", href: "/learn/center" }]);
});

test("空授权和空历史保持为空且使用简洁空状态", () => {
  const model = learnerHomeModel(home());

  assert.deepEqual(model.scenarioCards, []);
  assert.deepEqual(model.courseCards, []);
  assert.deepEqual(model.recentRecords, []);
  assert.deepEqual(model.emptyMessages, {
    scenarios: "暂无可用应用",
    courses: "暂无可学课程",
    recentRecords: "暂无学习记录"
  });
});

test("学习中心模型展示授权内容和基础学习统计", () => {
  const model = learnerHomeModel(home({
    scenarios: [scenario("scenario-1", "experience-ai-chat", "AI 对话")],
    courses: [{
      id: "course-1",
      name: "语文课程",
      summary: "课程摘要",
      tags: ["语文"],
      coverUrl: "",
      publishedAt: "2026-08-14T00:00:00.000Z"
    }]
  }));

  assert.deepEqual(model.scenarioCards.map((item) => item.name), ["AI 对话"]);
  assert.deepEqual(model.courseCards.map((item) => item.name), ["语文课程"]);
});

test("学习者首页保留身份标签并只使用 API 返回的最近记录", () => {
  const model = learnerHomeModel(home({
    learner: {
      id: "learner-1",
      nickname: "小明",
      grade: "UNIVERSITY_OR_WORK",
      gradeLabel: "大学和工作",
      avatarUrl: null
    },
    recentRecords: [
      {
        id: "record-1",
        type: "AI_TASK",
        title: "阅读练习",
        status: "SUCCEEDED",
        href: "/tools/reading",
        createdAt: "2026-08-14T01:00:00.000Z"
      }
    ]
  }));

  assert.equal(model.learner.avatarFallback, "小");
  assert.equal(model.learner.gradeLabel, "大学和工作");
  assert.deepEqual(model.recentRecords.map((record) => [record.id, record.href]), [
    ["record-1", "/tools/reading"]
  ]);
});

test("场景卡片归一根入口并去除内部子场景和重复项", () => {
  const model = learnerHomeModel(home({
    scenarios: [
      scenario("video-root", "video-guide-narration", "视频导学"),
      scenario("video-child", "video-guide-practice-questions", "视频练习"),
      scenario("chat-root", "experience-ai-chat", "AI 对话"),
      scenario("chat-duplicate", "experience-ai-chat", "重复对话")
    ]
  }));

  assert.deepEqual(model.scenarioCards.map((card) => [card.slug, card.href]), [
    ["video-guide-narration", "/media-tutor"],
    ["experience-ai-chat", "/experience/chat"]
  ]);
});

test("切换目标只包含其他有效学习者", () => {
  assert.deepEqual(
    profileSwitcherTargets(
      [
        learner({ id: "learner-1", status: "ACTIVE" }),
        learner({ id: "learner-2", nickname: "小红", status: "ACTIVE" }),
        learner({ id: "learner-3", status: "INACTIVE" })
      ],
      "learner-1"
    ).map((item) => item.id),
    ["learner-2"]
  );
});

test("公共账号菜单按服务端身份显示我的账号或学习者昵称", () => {
  const user = {
    id: "user-1",
    accountId: "10000",
    email: "user@example.com",
    phone: null,
    phoneVerifiedAt: null,
    nickname: "主账号",
    avatarUrl: "/account.png",
    status: "ACTIVE"
  };

  assert.deepEqual(profileIdentityPresentation(user, { mode: "ACCOUNT" }), {
    label: "我的账号",
    nickname: "主账号",
    avatarUrl: "/account.png",
    showsAccountControls: true
  });
  assert.deepEqual(
    profileIdentityPresentation(user, {
      mode: "LEARNER",
      home: home({
        learner: {
          id: "learner-1",
          nickname: "小明",
          grade: "GRADE_1",
          gradeLabel: "一年级",
          avatarUrl: "/learner.png"
        }
      })
    }),
    {
      label: "小明",
      nickname: "小明",
      avatarUrl: "/learner.png",
      showsAccountControls: false
    }
  );
});

test("公共页面登录入口会把当前页面作为登录后的返回目标", () => {
  assert.equal(loginHrefForCurrentPage("/login", "/center"), "/login?next=%2Fcenter");
  assert.equal(
    loginHrefForCurrentPage("/login", "/articles?page=3&page=4&tag=%E8%AF%AD%E6%96%87"),
    "/login?next=%2Farticles%3Fpage%3D3%26page%3D4%26tag%3D%25E8%25AF%25AD%25E6%2596%2587"
  );
  assert.equal(loginHrefForCurrentPage("/login?next=%2Ftools", "/center"), "/login?next=%2Ftools");
  assert.equal(loginHrefForCurrentPage("/login", "/login"), "/login");
});

test("客户端身份组件只从顶层 use server 边界导入运行时动作", async () => {
  const clientFiles = [
    "../src/components/profiles/profile-selector.tsx",
    "../src/components/profiles/learner-manager.tsx",
    "../src/components/profiles/learner-form.tsx",
    "../src/components/profiles/learner-authorization-form.tsx",
    "../src/components/profiles/profile-switcher.tsx",
    "../src/components/profiles/learner-center.tsx"
  ];

  for (const relativePath of clientFiles) {
    const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
    const profileApiImports = source.matchAll(
      /import\s*\{([^}]*)\}\s*from\s*"@\/lib\/profile-api";/gu
    );

    for (const [, importedNames = ""] of profileApiImports) {
      assert.equal(
        importedNames.split(",").every((name) => name.trim().startsWith("type ")),
        true,
        `${relativePath} 不得从服务端 profile-api 导入运行时值`
      );
    }
  }

  const actionBoundary = await readFile(
    new URL("../src/lib/profile-actions.ts", import.meta.url),
    "utf8"
  );
  assert.match(actionBoundary, /^"use server";/u);
});

test("学习中心按基本信息、授权内容、学习情况顺序展示并绑定自助动作", async () => {
  const source = await readFile(
    new URL("../src/components/profiles/learner-center.tsx", import.meta.url),
    "utf8"
  );
  const profileIndex = source.indexOf("基本信息");
  const appsIndex = source.indexOf("已授权应用");
  const resourcesIndex = source.indexOf("已授权学习资源");
  const statisticsIndex = source.indexOf("学习情况");

  assert.ok(profileIndex >= 0 && profileIndex < appsIndex);
  assert.ok(appsIndex < resourcesIndex && resourcesIndex < statisticsIndex);
  assert.match(source, /useActionState\(updateCurrentLearnerAction,/u);
  assert.match(source, /useActionState\(uploadCurrentLearnerAvatarAction,/u);
  assert.match(source, /今日有效在线时长/u);
  assert.match(source, /今日学习时长/u);
  assert.match(source, /本周学习天数/u);
  assert.match(source, /最近 7 天学习趋势/u);

  const pageSource = await readFile(
    new URL("../src/app/learn/center/page.tsx", import.meta.url),
    "utf8"
  );
  assert.match(pageSource, /requireLearnerProfile\("\/learn\/center"\)/u);
  assert.match(pageSource, /getLearnerLearningOverview/u);
});

test("学习者切换密码浮层通过 body Portal 保持视口垂直居中", async () => {
  const source = await readFile(
    new URL("../src/components/profiles/profile-switcher.tsx", import.meta.url),
    "utf8"
  );

  assert.match(source, /createPortal\(/u);
  assert.match(source, /fixed inset-0[^\n]*items-center justify-center/u);
  assert.match(source, /document\.body/u);
  assert.match(source, /setDialog\("LOGOUT"\)/u);
  assert.match(source, /title="退出登录"/u);
  assert.match(source, /name="switchPassword"/u);
});

test("登录后的身份选择界面以视口居中的模态浮层展示", async () => {
  const source = await readFile(
    new URL("../src/app/select-profile/page.tsx", import.meta.url),
    "utf8"
  );

  assert.match(source, /fixed inset-0.*items-center justify-center/u);
  assert.match(source, /role="dialog"/u);
  assert.match(source, /aria-modal="true"/u);
});

test("身份选择页先确认当前用户再请求身份列表", async () => {
  let releaseUser: ((value: unknown) => void) | undefined;
  const userPromise = new Promise((resolve) => {
    releaseUser = resolve;
  });
  globalThis.__task4PageMocks = {
    events: [],
    userContinuations: [],
    userPromise
  };

  const render = SelectProfilePage({ searchParams: Promise.resolve({ next: "/text2lesson" }) });
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(globalThis.__task4PageMocks.events, ["user"]);
  assert.deepEqual(globalThis.__task4PageMocks.userContinuations, ["/text2lesson"]);
  releaseUser?.({ id: "user-1" });
  await render;
  assert.deepEqual(globalThis.__task4PageMocks.events, ["user", "selection"]);
});

test("身份选择页渲染不修改会话，交由客户端自动提交账号选择", async () => {
  globalThis.__task4PageMocks = {
    events: [],
    userContinuations: [],
    userPromise: Promise.resolve({ id: "user-1" })
  };

  const page = await SelectProfilePage({ searchParams: Promise.resolve({ next: "/text2lesson" }) });
  assert.match(JSON.stringify(page), /"autoSelectAccount":true/u);
  assert.doesNotMatch(JSON.stringify(page), /身份选择失败/u);
  assert.deepEqual(globalThis.__task4PageMocks.events, ["user", "selection"]);
});

test("有可用学习账号时不自动选择主账号，只有停用账号时自动选择", async () => {
  for (const [status, expected] of [["ACTIVE", false], ["INACTIVE", true]] as const) {
    globalThis.__task4PageMocks = {
      learners: [{ status }],
      events: [],
      userContinuations: [],
      userPromise: Promise.resolve({ id: "user-1" })
    };
    const page = await SelectProfilePage({ searchParams: Promise.resolve({ next: "/text2lesson" }) });
    assert.match(JSON.stringify(page), new RegExp(`"autoSelectAccount":${expected}`));
    assert.match(JSON.stringify(page), /"next":"\/text2lesson"/u);
    assert.deepEqual(globalThis.__task4PageMocks.events, ["user", "selection"]);
  }
});

function learner(overrides: Partial<ReturnType<typeof baseLearner>>) {
  return { ...baseLearner(), ...overrides };
}

function baseLearner() {
  return {
    id: "learner-default",
    accountId: "100",
    nickname: "学习者",
    grade: "GRADE_1",
    gradeLabel: "一年级",
    avatarUrl: null,
    status: "ACTIVE",
    deactivatedAt: null,
    createdAt: "2026-08-14T00:00:00.000Z",
    updatedAt: "2026-08-14T00:00:00.000Z"
  };
}

function home(overrides: Record<string, unknown> = {}) {
  return {
    learner: {
      id: "learner-1",
      nickname: "小明",
      grade: "GRADE_1",
      gradeLabel: "一年级",
      avatarUrl: null
    },
    scenarios: [],
    courses: [],
    recentRecords: [],
    ...overrides
  };
}

function scenario(id: string, slug: string, name: string) {
  return { id, slug, name, description: null };
}
