import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { registerHooks } from "node:module";

interface Task5Mocks {
  cookieStore: {
    getAll(): Array<{ name: string; value: string }>;
  };
  redirects: string[];
  revalidations: unknown[][];
}

declare global {
  var __task5Mocks: Task5Mocks;
}

globalThis.__task5Mocks = createMocks();

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/headers") {
      return {
        shortCircuit: true,
        url: "data:text/javascript,export async function cookies(){return globalThis.__task5Mocks.cookieStore};export async function headers(){return new Headers()}"
      };
    }
    if (specifier === "next/cache") {
      return {
        shortCircuit: true,
        url: "data:text/javascript,export function revalidatePath(...args){globalThis.__task5Mocks.revalidations.push(args)}"
      };
    }
    if (specifier === "next/navigation") {
      return {
        shortCircuit: true,
        url: "data:text/javascript,export function redirect(path){globalThis.__task5Mocks.redirects.push(path);throw Object.assign(new Error('NEXT_REDIRECT'),{destination:path})};export function usePathname(){return '/dashboard/learners'};export function useRouter(){return {refresh(){}}}"
      };
    }
    return nextResolve(specifier, context);
  }
});

const learnerForm = await import("../src/components/profiles/learner-form.js");
const learnerAuthorization = await import(
  "../src/components/profiles/learner-authorization-form.js"
);
const learnerManager = await import("../src/components/profiles/learner-manager.js");
const learnerManagementSection = await import(
  "../src/components/profiles/learner-management-section.js"
);
const profileApi = await import("../src/lib/profile-api.js");
const dashboardShell = await import("../src/components/shell/dashboard-shell.js");
const userAccountMenu = await import("../src/components/shell/user-account-menu.js");
const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.__task5Mocks = createMocks();
  globalThis.fetch = async () => apiResponse(200, {});
});

after(() => {
  globalThis.fetch = originalFetch;
});

test("首个学习者要求六位切换密码并允许提交空授权", () => {
  const model = learnerForm.learnerFormModel({ learnerCount: 0, hasLoginPassword: true });

  assert.equal(model.requiresSwitchPassword, true);
  assert.equal(model.canCreate, true);
  assert.deepEqual(learnerAuthorization.normalizeAuthorizationSelection([], []), {
    scenarioIds: [],
    courseIds: []
  });
  assert.deepEqual(
    learnerForm.validateLearnerInput(
      { nickname: " 小明 ", grade: "GRADE_1", switchPassword: "123456" },
      [{ value: "GRADE_1", label: "一年级" }],
      model
    ),
    {
      data: { nickname: "小明", grade: "GRADE_1", switchPassword: "123456" }
    }
  );
});

test("后续学习者不显示也不提交切换密码", () => {
  const model = learnerForm.learnerFormModel({ learnerCount: 1, hasLoginPassword: true });

  assert.equal(model.requiresSwitchPassword, false);
  assert.deepEqual(
    learnerForm.validateLearnerInput(
      { nickname: "小红", grade: "GRADE_2", switchPassword: "654321" },
      [{ value: "GRADE_2", label: "二年级" }],
      model
    ),
    { data: { nickname: "小红", grade: "GRADE_2" } }
  );
});

test("后续学习者创建动作不要求或发送切换密码", async () => {
  const requests: RequestInit[] = [];
  globalThis.fetch = async (_input, init) => {
    requests.push(init ?? {});
    return apiResponse(200, {});
  };

  assert.deepEqual(
    await profileApi.createLearnerAction(
      {},
      formData({
        canCreate: "true",
        requiresSwitchPassword: "false",
        nickname: "小红",
        grade: "GRADE_2"
      })
    ),
    { success: "学习者已添加" }
  );
  assert.deepEqual(jsonBody(requests[0]), {
    nickname: "小红",
    grade: "GRADE_2",
    scenarioIds: [],
    courseIds: []
  });
});

test("昵称、学段和首个切换密码在请求前给出简短中文校验", async () => {
  const requests: string[] = [];
  globalThis.fetch = async (input) => {
    requests.push(String(input));
    return apiResponse(200, {});
  };

  const cases: Array<[Record<string, string>, string]> = [
    [{ nickname: " ", grade: "GRADE_1", switchPassword: "123456" }, "请输入学习者昵称"],
    [{ nickname: "小明", grade: "UNKNOWN", switchPassword: "123456" }, "请选择正确的学段"],
    [{ nickname: "小明", grade: "GRADE_1", switchPassword: "12345a" }, "切换密码必须为 6 位数字"]
  ];

  for (const [values, error] of cases) {
    assert.deepEqual(await profileApi.createLearnerAction({}, formData(values)), { error });
  }
  assert.deepEqual(requests, []);
});

test("无登录密码账号不能创建首个学习者并指向精确设置链接", async () => {
  const model = learnerForm.learnerFormModel({ learnerCount: 0, hasLoginPassword: false });
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return apiResponse(200, {});
  };

  assert.deepEqual(model, {
    canCreate: false,
    passwordSetupHref: "/forgot-password?next=/dashboard/learners",
    requiresSwitchPassword: true
  });
  assert.deepEqual(
    await profileApi.createLearnerAction(
      {},
      formData({
        canCreate: "false",
        nickname: "小明",
        grade: "GRADE_1",
        switchPassword: "123456"
      })
    ),
    { error: "请先设置主账号登录密码" }
  );
  assert.equal(called, false);
});

test("有效与停用学习者分组且恢复操作只属于停用行", () => {
  const result = learnerManager.learnerListModel([
    learner({ id: "inactive", status: "INACTIVE" }),
    learner({ id: "active", status: "ACTIVE" })
  ]);

  assert.deepEqual(result.active.map((item) => [item.id, item.action]), [["active", "deactivate"]]);
  assert.deepEqual(result.inactive.map((item) => [item.id, item.action]), [["inactive", "restore"]]);
});

test("停用学习者使用固定的保留记录确认文案", () => {
  assert.equal(
    learnerManager.deactivationConfirmationText,
    "停用后将无法选择该学习账号，已有学习记录仍会保留。"
  );
});

test("创建、编辑、授权、停用、恢复和切换密码使用正确 HTTP 契约", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    return apiResponse(200, {});
  };

  assert.deepEqual(
    await profileApi.createLearnerAction(
      {},
      formData({
        canCreate: "true",
        nickname: " 小明 ",
        grade: "GRADE_1",
        switchPassword: "123456",
        scenarioIds: ["scenario-1"],
        courseIds: []
      })
    ),
    { success: "学习者已添加" }
  );
  assert.deepEqual(
    await profileApi.updateLearnerAction(
      {},
      formData({ learnerId: "learner/1", nickname: "小红", grade: "GRADE_2" })
    ),
    { success: "学习者资料已保存" }
  );
  assert.deepEqual(
    await profileApi.replaceLearnerAuthorizationsAction(
      {},
      formData({ learnerId: "learner/1", scenarioIds: [], courseIds: [] })
    ),
    { success: "可用内容已保存" }
  );
  assert.deepEqual(
    await profileApi.deactivateLearnerAction({}, formData({ learnerId: "learner/1" })),
    { success: "学习者已停用" }
  );
  assert.deepEqual(
    await profileApi.restoreLearnerAction({}, formData({ learnerId: "learner/1" })),
    { success: "学习者已恢复" }
  );
  assert.deepEqual(
    await profileApi.updateSwitchPasswordAction(
      {},
      formData({ currentPassword: "account-password", switchPassword: "654321" })
    ),
    { success: "切换密码已更新" }
  );

  assert.deepEqual(
    requests.map(({ url, init }) => [new URL(url).pathname, init?.method, jsonBody(init)]),
    [
      ["/api/profiles/learners", "POST", { nickname: "小明", grade: "GRADE_1", switchPassword: "123456", scenarioIds: ["scenario-1"], courseIds: [] }],
      ["/api/profiles/learners/learner%2F1", "PATCH", { nickname: "小红", grade: "GRADE_2" }],
      ["/api/profiles/learners/learner%2F1/authorizations", "PUT", { scenarioIds: [], courseIds: [] }],
      ["/api/profiles/learners/learner%2F1/deactivate", "POST", undefined],
      ["/api/profiles/learners/learner%2F1/restore", "POST", undefined],
      ["/api/profiles/switch-password", "PATCH", { currentPassword: "account-password", switchPassword: "654321" }]
    ]
  );
  assert.deepEqual(globalThis.__task5Mocks.revalidations, Array.from({ length: 6 }, () => [
    ["/dashboard/learners"],
    ["/dashboard/learners/data"],
    ["/dashboard/learners/resources"],
    ["/dashboard/learners/apps"],
    ["/select-profile"],
    ["/learn"],
    ["/learn/center"]
  ]).flat());
});

test("失败变更不 revalidate 且英文内部错误不暴露", async () => {
  globalThis.fetch = async () =>
    apiResponse(500, null, "Prisma stack: Internal server error");

  assert.deepEqual(
    await profileApi.createLearnerAction(
      {},
      formData({ canCreate: "true", nickname: "小明", grade: "GRADE_1", switchPassword: "123456" })
    ),
    { error: "学习者添加失败，请稍后再试" }
  );
  assert.deepEqual(globalThis.__task5Mocks.revalidations, []);

  globalThis.fetch = async () =>
    apiResponse(500, null, "Prisma 错误：unique constraint stack");
  assert.deepEqual(
    await profileApi.createLearnerAction(
      {},
      formData({ canCreate: "true", nickname: "小明", grade: "GRADE_1", switchPassword: "123456" })
    ),
    { error: "学习者添加失败，请稍后再试" }
  );
});

test("头像必须为非空文件并以 multipart 发送且不手动设置 Content-Type", async () => {
  assert.deepEqual(
    await profileApi.uploadLearnerAvatarAction({}, formData({ learnerId: "learner-1" })),
    { error: "请选择头像图片" }
  );

  const requests: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    return apiResponse(200, {});
  };
  const data = new FormData();
  data.set("learnerId", "learner-1");
  data.set("file", new File(["avatar"], "avatar.png", { type: "image/png" }));

  assert.deepEqual(await profileApi.uploadLearnerAvatarAction({}, data), {
    success: "头像已更新"
  });
  assert.equal(requests[0]?.init?.method, "PATCH");
  assert.ok(requests[0]?.init?.body instanceof FormData);
  assert.equal(new Headers(requests[0]?.init?.headers).has("Content-Type"), false);
});

test("学习者自助资料动作不接受客户端 learnerId 并使用当前身份接口", async () => {
  const updateAction = (profileApi as unknown as {
    updateCurrentLearnerAction?: typeof profileApi.updateLearnerAction;
  }).updateCurrentLearnerAction;
  const avatarAction = (profileApi as unknown as {
    uploadCurrentLearnerAvatarAction?: typeof profileApi.uploadLearnerAvatarAction;
  }).uploadCurrentLearnerAvatarAction;
  assert.equal(typeof updateAction, "function");
  assert.equal(typeof avatarAction, "function");

  const requests: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    return apiResponse(200, {});
  };

  assert.deepEqual(
    await updateAction?.({}, formData({ nickname: " 新昵称 ", learnerId: "learner-forged" })),
    { success: "昵称已更新" }
  );
  const avatarData = formData({ learnerId: "learner-forged" });
  avatarData.set("file", new File(["avatar"], "avatar.png", { type: "image/png" }));
  assert.deepEqual(await avatarAction?.({}, avatarData), { success: "头像已更新" });

  assert.deepEqual(
    requests.map(({ url, init }) => [new URL(url).pathname, init?.method]),
    [
      ["/api/profiles/learner/me", "PATCH"],
      ["/api/profiles/learner/me/avatar", "PATCH"]
    ]
  );
  assert.deepEqual(jsonBody(requests[0]?.init), { nickname: "新昵称" });
  assert.ok(requests[1]?.init?.body instanceof FormData);
  assert.equal((requests[1]?.init?.body as FormData).has("learnerId"), false);
});

test("主账号守卫集中映射未选择、学习者、账号与登录失效", async () => {
  const cases: Array<[number, string, string]> = [
    [403, "请先选择使用身份", "/select-profile?next=%2Fdashboard%2Flearners"],
    [403, "请切换到主账号身份后操作", "/learn"],
    [401, "登录状态已失效，请重新登录", "/login?next=%2Fdashboard%2Flearners"]
  ];

  for (const [status, message, destination] of cases) {
    globalThis.fetch = async () => apiResponse(status, null, message);
    await assert.rejects(
      profileApi.requireAccountProfile("/dashboard/learners"),
      (error: Error & { destination?: string }) => error.destination === destination
    );
  }

  globalThis.fetch = async () =>
    apiResponse(200, [{ value: "GRADE_1", label: "一年级" }]);
  assert.deepEqual(await profileApi.requireAccountProfile(), [
    { value: "GRADE_1", label: "一年级" }
  ]);
});

test("学习账号入口只加入账号导航和账号菜单", () => {
  assert.ok(
    dashboardShell.dashboardNavItems.some(
      (item) => item.href === "/dashboard/learners" && item.label === "学习账号"
    )
  );
  assert.ok(
    userAccountMenu.accountManagementMenuItems.some(
      (item) => item.href === "/dashboard/learners" && item.label === "学习账号"
    )
  );
});

test("学习账号导航提供账号管理、学习数据、资源授权和应用授权四个下级入口", () => {
  const learnerNavItem = dashboardShell.dashboardNavItems.find(
    (item) => item.href === "/dashboard/learners"
  ) as { children?: Array<{ href: string; label: string }> } | undefined;

  assert.deepEqual(learnerNavItem?.children, [
    { href: "/dashboard/learners", label: "账号管理" },
    { href: "/dashboard/learners/data", label: "学习数据" },
    { href: "/dashboard/learners/resources", label: "资源授权" },
    { href: "/dashboard/learners/apps", label: "应用授权" }
  ]);
});

test("资源授权支持按全部、已授权和未授权筛选专辑", () => {
  const filterCourses = (learnerAuthorization as unknown as {
    filterAuthorizationCourses?: (
      courses: Array<{ id: string; name: string }>,
      authorizedIds: string[],
      filter: "ALL" | "AUTHORIZED" | "UNAUTHORIZED"
    ) => Array<{ id: string; name: string }>;
  }).filterAuthorizationCourses;
  const courses = [
    { id: "course-1", name: "语文基础" },
    { id: "course-2", name: "英语阅读" },
    { id: "course-3", name: "数学思维" }
  ];

  assert.equal(typeof filterCourses, "function");
  assert.deepEqual(filterCourses?.(courses, ["course-2"], "ALL").map((course) => course.id), [
    "course-1",
    "course-2",
    "course-3"
  ]);
  assert.deepEqual(
    filterCourses?.(courses, ["course-2"], "AUTHORIZED").map((course) => course.id),
    ["course-2"]
  );
  assert.deepEqual(
    filterCourses?.(courses, ["course-2"], "UNAUTHORIZED").map((course) => course.id),
    ["course-1", "course-3"]
  );
});

test("切换单个资源授权时保留该学习账号的应用授权", () => {
  const toggleCourse = (learnerAuthorization as unknown as {
    toggleCourseAuthorization?: (
      authorizations: { scenarioIds: string[]; courseIds: string[] },
      courseId: string
    ) => { scenarioIds: string[]; courseIds: string[] };
  }).toggleCourseAuthorization;

  assert.equal(typeof toggleCourse, "function");
  assert.deepEqual(
    toggleCourse?.({ scenarioIds: ["app-1"], courseIds: ["course-1"] }, "course-2"),
    { scenarioIds: ["app-1"], courseIds: ["course-1", "course-2"] }
  );
  assert.deepEqual(
    toggleCourse?.({ scenarioIds: ["app-1"], courseIds: ["course-1", "course-2"] }, "course-1"),
    { scenarioIds: ["app-1"], courseIds: ["course-2"] }
  );
});

test("多个学习账号直接展示头像名称并区分当前选择", () => {
  const items = (learnerManagementSection as unknown as {
    learnerAccountPickerItems?: (
      action: string,
      learners: Array<ReturnType<typeof learner>>,
      selectedLearnerId: string
    ) => Array<{
      href: string;
      selected: boolean;
      dimmed: boolean;
      avatarFallback: string;
    }>;
  }).learnerAccountPickerItems;

  assert.equal(typeof items, "function");
  assert.deepEqual(
    items?.(
      "/dashboard/learners/resources",
      [
        learner({ id: "learner-1", nickname: "大宝", avatarUrl: "/avatar-1.png" }),
        learner({ id: "learner/2", nickname: "小宝", avatarUrl: null })
      ],
      "learner-1"
    ),
    [
      {
        href: "/dashboard/learners/resources?learnerId=learner-1",
        selected: true,
        dimmed: false,
        avatarFallback: "大"
      },
      {
        href: "/dashboard/learners/resources?learnerId=learner%2F2",
        selected: false,
        dimmed: true,
        avatarFallback: "小"
      }
    ]
  );
});

test("应用授权支持全部、已授权和未授权筛选", () => {
  const filterScenarios = (learnerAuthorization as unknown as {
    filterAuthorizationScenarios?: (
      scenarios: Array<{ id: string; name: string }>,
      authorizedIds: string[],
      filter: "ALL" | "AUTHORIZED" | "UNAUTHORIZED"
    ) => Array<{ id: string; name: string }>;
  }).filterAuthorizationScenarios;
  const scenarios = [
    { id: "app-1", name: "AI 对话", slug: "experience-ai-chat" },
    { id: "app-2", name: "英文带学", slug: "english-guided-study-material" },
    { id: "app-3", name: "学习闪卡", slug: "learning-flashcards-deck" }
  ];

  assert.equal(typeof filterScenarios, "function");
  assert.deepEqual(filterScenarios?.(scenarios, ["app-2"], "ALL").map((item) => item.id), [
    "app-1",
    "app-2",
    "app-3"
  ]);
  assert.deepEqual(
    filterScenarios?.(scenarios, ["app-2"], "AUTHORIZED").map((item) => item.id),
    ["app-2"]
  );
  assert.deepEqual(
    filterScenarios?.(scenarios, ["app-2"], "UNAUTHORIZED").map((item) => item.id),
    ["app-1", "app-3"]
  );
});

test("应用授权合并体验应用和场景应用并支持类型与授权状态组合筛选", () => {
  const filterScenarios = (learnerAuthorization as unknown as {
    filterAuthorizationScenarios?: (
      scenarios: Array<{ id: string; name: string; slug: string }>,
      authorizedIds: string[],
      statusFilter: "ALL" | "AUTHORIZED" | "UNAUTHORIZED",
      typeFilter: "ALL" | "EXPERIENCE" | "SCENARIO"
    ) => Array<{ id: string; name: string; slug: string }>;
  }).filterAuthorizationScenarios;
  const scenarios = [
    { id: "experience-1", name: "AI 对话", slug: "experience-ai-chat" },
    { id: "experience-2", name: "视频生成", slug: "experience-video-generation" },
    { id: "scenario-1", name: "视频导学", slug: "video-guide-narration" },
    { id: "scenario-2", name: "字帖生成", slug: "zitie" },
    { id: "generic-1", name: "作文点评", slug: "writing-review" }
  ];

  assert.deepEqual(
    filterScenarios?.(scenarios, ["experience-1", "scenario-1"], "ALL", "EXPERIENCE")
      .map((item) => item.id),
    ["experience-1", "experience-2"]
  );
  assert.deepEqual(
    filterScenarios?.(scenarios, ["experience-1", "scenario-1"], "AUTHORIZED", "SCENARIO")
      .map((item) => item.id),
    ["scenario-1"]
  );
  assert.deepEqual(
    filterScenarios?.(scenarios, [], "ALL", "SCENARIO").map((item) => item.id),
    ["scenario-1", "scenario-2"]
  );
});

test("应用授权使用固定产品名称并拒绝把普通 AI 场景归类为场景应用", () => {
  const applicationType = learnerAuthorization.authorizationApplicationType;
  const applicationLabel = learnerAuthorization.authorizationApplicationLabel;

  assert.equal(applicationType("experience-ai-chat"), "EXPERIENCE");
  assert.equal(applicationType("video-guide-narration"), "SCENARIO");
  assert.equal(applicationType("writing-review"), null);
  assert.equal(applicationLabel({ name: "AI 对话", slug: "experience-ai-chat" }), "AI问答");
  assert.equal(applicationLabel({ name: "讲解音频", slug: "article-to-speech" }), "语音合成");
  assert.equal(applicationLabel({ name: "内部名", slug: "daodu" }), "开卷导读");
});

test("切换应用授权时保留资源授权", () => {
  const toggleScenario = (learnerAuthorization as unknown as {
    toggleScenarioAuthorization?: (
      authorizations: { scenarioIds: string[]; courseIds: string[] },
      scenarioId: string
    ) => { scenarioIds: string[]; courseIds: string[] };
  }).toggleScenarioAuthorization;

  assert.equal(typeof toggleScenario, "function");
  assert.deepEqual(
    toggleScenario?.({ scenarioIds: ["app-1"], courseIds: ["course-1"] }, "app-2"),
    { scenarioIds: ["app-1", "app-2"], courseIds: ["course-1"] }
  );
  assert.deepEqual(
    toggleScenario?.({ scenarioIds: ["app-1", "app-2"], courseIds: ["course-1"] }, "app-1"),
    { scenarioIds: ["app-2"], courseIds: ["course-1"] }
  );
});

function createMocks(): Task5Mocks {
  return {
    cookieStore: {
      getAll: () => [{ name: "xueleai_user_access", value: "access-token" }]
    },
    redirects: [],
    revalidations: []
  };
}

function apiResponse(status: number, data: unknown, message = status < 400 ? "成功" : "请求失败") {
  return new Response(
    JSON.stringify({ code: status < 400 ? 0 : status * 100 + 1, message, data }),
    { status, headers: { "Content-Type": "application/json" } }
  );
}

function formData(values: Record<string, string | string[]>) {
  const data = new FormData();

  for (const [name, value] of Object.entries(values)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      data.append(name, item);
    }
  }

  return data;
}

function jsonBody(init?: RequestInit) {
  return typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
}

function learner(overrides: Record<string, unknown>) {
  return {
    id: "learner-1",
    accountId: "100",
    nickname: "学习者",
    grade: "GRADE_1",
    gradeLabel: "一年级",
    avatarUrl: null,
    status: "ACTIVE",
    deactivatedAt: null,
    createdAt: "2026-08-14T00:00:00.000Z",
    updatedAt: "2026-08-14T00:00:00.000Z",
    ...overrides
  };
}
