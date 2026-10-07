import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { registerHooks } from "node:module";

import {
  applicationRootForPath,
  isPublicLearningSharePath,
  learnerEntryDecision,
  learnerScenarioHref,
  normalizeSafeNextPath,
  normalizeLearnerScenarioRoot,
  profileContinuationPath,
  profileSelectionHref,
  selectorLoginContinuation,
  selectionDestination
} from "../src/lib/profile-routing.js";

interface CookieWrite {
  name: string;
  value: string;
  options: Record<string, unknown>;
}

interface Task4Mocks {
  cookieStore: {
    values: Map<string, string>;
    setCalls: CookieWrite[];
    deleteCalls: string[];
    getAll(): Array<{ name: string; value: string }>;
    get(name: string): { name: string; value: string } | undefined;
    set(name: string, value: string, options: Record<string, unknown>): void;
    delete(name: string): void;
  };
  requestHeaders: Headers;
  redirects: string[];
  revalidations: unknown[][];
}

declare global {
  var __task4Mocks: Task4Mocks;
}

globalThis.__task4Mocks = createTask4Mocks();

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/headers") {
      return {
        shortCircuit: true,
        url: "data:text/javascript,export async function cookies(){return globalThis.__task4Mocks.cookieStore};export async function headers(){return globalThis.__task4Mocks.requestHeaders}"
      };
    }
    if (specifier === "next/cache") {
      return {
        shortCircuit: true,
        url: "data:text/javascript,export function revalidatePath(...args){globalThis.__task4Mocks.revalidations.push(args)}"
      };
    }
    if (specifier === "next/navigation") {
      return {
        shortCircuit: true,
        url: "data:text/javascript,export function redirect(path){globalThis.__task4Mocks.redirects.push(path);throw Object.assign(new Error('NEXT_REDIRECT'),{destination:path})};export function usePathname(){return '/center'};export function useRouter(){return {refresh(){}}}"
      };
    }
    return nextResolve(specifier, context);
  }
});

const profileApi = await import("../src/lib/profile-api.js");
const authActions = await import("../src/lib/auth-actions.js");
const courseApi = await import("../src/lib/course-api.js");
const { default: ResourceCenterPage } = await import("../src/app/center/page.js");
const { default: ZitiePage } = await import("../src/app/zitie/page.js");
const { NextRequest } = await import("next/server");
const { proxy } = await import("../src/proxy.js");
const originalFetch = globalThis.fetch;

test("四类用户登录 Server Action 转发扫码上下文，保留浏览器登录互斥",async()=>{
  const cases:Array<{action:typeof authActions.userLoginAction;entries:Record<string,string>}>=[
    {action:authActions.userLoginAction,entries:{email:"owner@example.com",password:"password"}},
    {action:authActions.registerAction,entries:{nickname:"用户",email:"owner@example.com",password:"password",emailCode:"123456"}},
    {action:authActions.phoneLoginAction,entries:{phone:"13800000001",code:"123456"}},
    {action:authActions.learnerLoginAction,entries:{accountId:"10000",learnerId:"100",switchPassword:"123456"}}
  ];
  for(const {action,entries}of cases){
    globalThis.__task4Mocks=createTask4Mocks();globalThis.__task4Mocks.cookieStore.values.set("__Host-abei_wechat_scan_context","bound-browser-context");let forwarded:string|null=null;
    globalThis.fetch=async(_input,init)=>{forwarded=new Headers(init?.headers).get("Cookie");return apiResponse(400,{code:40011,message:"扫码登录处理中",data:null});};
    await action({},formData(entries));assert.match(forwarded??"",/__Host-abei_wechat_scan_context=bound-browser-context/);
    assert.equal(globalThis.__task4Mocks.cookieStore.setCalls.length,0);
  }
});

beforeEach(() => {
  globalThis.__task4Mocks = createTask4Mocks();
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        code: 0,
        message: "成功",
        data: {
          accessToken: "access-token",
          refreshToken: "refresh-token",
          accessTokenExpiresIn: 900,
          refreshTokenExpiresIn: 2592000
        }
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
});

after(() => {
  globalThis.fetch = originalFetch;
});

test("登录后的目标先经过身份选择并保留规范站内路径", () => {
  assert.equal(profileSelectionHref("/text2lesson"), "/select-profile?next=%2Ftext2lesson");
  assert.equal(
    profileSelectionHref("/courses/../text2lesson?mode=quick#start"),
    "/select-profile?next=%2Ftext2lesson%3Fmode%3Dquick%23start"
  );
  assert.equal(normalizeSafeNextPath("/dashboard/billing"), "/dashboard/billing");
  assert.equal(normalizeSafeNextPath("/search?q=a%26b"), "/search?q=a%26b");
});

test("外部、后台、反斜杠、控制字符和畸形编码目标均被拒绝", () => {
  for (const target of [
    "https://evil.example/path",
    "//evil.example/path",
    "/admin",
    "/admin/users",
    "/admin%2Fusers",
    "/admin%252Fusers",
    "/safe\\evil",
    "/safe%5Cevil",
    "/safe%255Cevil",
    "/safe\npath",
    "/safe%0Apath",
    "/safe%250Apath",
    "/bad%ZZpath"
  ]) {
    assert.equal(normalizeSafeNextPath(target), null, target);
    assert.equal(profileSelectionHref(target), "/select-profile", target);
  }
});

test("编码点段和斜杠先完全解码并规范化，不能穿越到后台", () => {
  for (const target of [
    "/safe/%2e%2e/admin",
    "/safe/%252e%252e/admin",
    "/safe/.%252e/admin",
    "/safe/%252e.%2Fadmin",
    "/safe%252F..%252Fadmin",
    "/safe/%252e%252e%252fadmin"
  ]) {
    assert.equal(normalizeSafeNextPath(target), null, target);
  }

  assert.equal(normalizeSafeNextPath("/safe/%252e/lesson"), "/safe/lesson");
  assert.equal(
    normalizeSafeNextPath("/safe/%252e%252e/text2lesson?q=a%26b#part"),
    "/text2lesson?q=a%26b#part"
  );
});

test("身份选择页自身不能成为登录后或身份选择后的继续目标", () => {
  assert.equal(profileContinuationPath("/select-profile"), null);
  assert.equal(profileContinuationPath("/select-profile?next=%2Ftext2lesson"), null);
  assert.equal(profileSelectionHref("/select-profile?next=%2Ftext2lesson"), "/select-profile");
  assert.equal(selectionDestination("ACCOUNT", "/select-profile", []), "/dashboard");
  assert.equal(selectionDestination("LEARNER", "/select-profile", ["/select-profile"]), "/learn");
});

test("selector 登录回跳只提取一层已清洗的内部继续目标", () => {
  assert.equal(selectorLoginContinuation("/select-profile"), null);
  assert.equal(selectorLoginContinuation("/select-profile?next=%2Ftext2lesson"), "/text2lesson");
  assert.equal(selectorLoginContinuation("/select-profile?next=https%3A%2F%2Fevil.example"), null);
  assert.equal(
    selectorLoginContinuation(
      "/select-profile?next=%2Fselect-profile%3Fnext%3D%252Ftext2lesson"
    ),
    null
  );
});

test("proxy 为 selector 只保留内部 next，为 learn 保留自身目标", async () => {
  assert.equal(await proxyLocation("/select-profile"), "https://xueleai.test/login");
  assert.equal(
    await proxyLocation("/select-profile?next=%2Ftext2lesson"),
    "https://xueleai.test/login?next=%2Ftext2lesson"
  );
  assert.equal(
    await proxyLocation("/select-profile?next=https%3A%2F%2Fevil.example"),
    "https://xueleai.test/login"
  );
  assert.equal(
    await proxyLocation(
      "/select-profile?next=%2Fselect-profile%3Fnext%3D%252Ftext2lesson"
    ),
    "https://xueleai.test/login"
  );
  assert.equal(await proxyLocation("/learn"), "https://xueleai.test/login?next=%2Flearn");
  assert.equal(await proxyLocation("/learn/flashcards/public-deck"), null);
  assert.equal(await proxyLocation("/learn", "xueleai_user_refresh=refresh-token"), null);
});

test("学习者仅能继续已授权的安全入口，账号可继续安全站内目标", () => {
  assert.equal(selectionDestination("LEARNER", "/text2lesson", ["/text2lesson"]), "/text2lesson");
  assert.equal(selectionDestination("LEARNER", "/dashboard/billing", ["/text2lesson"]), "/learn");
  assert.equal(selectionDestination("LEARNER", "https://evil.example", ["https://evil.example"]), "/learn");
  assert.equal(selectionDestination("ACCOUNT", "/dashboard/billing", []), "/dashboard/billing");
  assert.equal(selectionDestination("ACCOUNT", "/admin/users", []), "/dashboard");
});

test("学习者完成身份选择后只对白名单格式的原资源详情页保留回跳", () => {
  const coursePath = "/c/507f1f77bcf86cd799439011";

  assert.equal(selectionDestination("LEARNER", coursePath, []), coursePath);
  assert.equal(selectionDestination("LEARNER", `${coursePath}?from=login#catalog`, []), `${coursePath}?from=login#catalog`);
  assert.equal(selectionDestination("LEARNER", "/c/not-a-course-id", []), "/learn");
  assert.equal(selectionDestination("LEARNER", "/c/507f1f77bcf86cd799439011/extra", []), "/learn");
  assert.equal(selectionDestination("LEARNER", "/c//507f1f77bcf86cd799439011", []), "/learn");
  assert.equal(selectionDestination("LEARNER", "/c/%2F507f1f77bcf86cd799439011", []), "/learn");
});

test("命名学习入口映射固定授权根且内部子场景归一", () => {
  const cases: Array<[string, string]> = [
    ["/tools/video-guide-practice-questions", "video-guide-narration"],
    ["/media-tutor", "video-guide-narration"],
    ["/media-tutor/creator/session-1", "video-guide-narration"],
    ["/text2lesson", "english-guided-study-material"],
    ["/text2lesson/creator/session-1", "english-guided-study-material"],
    ["/gushiwen", "gushiwen-guided-study-material"],
    ["/gushiwen/creator/session-1", "gushiwen-guided-study-material"],
    ["/flashcard", "learning-flashcards-deck"],
    ["/flashcard/creator/session-1", "learning-flashcards-deck"],
    ["/zitie", "zitie"],
    ["/daodu", "daodu"],
    ["/daodu/creator/session-1", "daodu"],
    ["/typing", "typing"],
    ["/typing/libraries/library-1", "typing"],
    ["/typing/practice/session-1", "typing"],
    ["/typing/review", "typing"],
    ["/typing/history", "typing"],
    ["/experience/chat", "experience-ai-chat"],
    ["/experience/image", "experience-image-generation"],
    ["/experience/video", "experience-video-generation"],
    ["/voice", "article-to-speech"]
  ];

  for (const [path, root] of cases) {
    assert.equal(applicationRootForPath(path), root, path);
  }
  assert.equal(applicationRootForPath("/tools/custom-writing"), null);
  assert.equal(learnerScenarioHref("typing"), "/typing");
  assert.equal(
    normalizeLearnerScenarioRoot("english-guided-study-image-extraction"),
    "english-guided-study-material"
  );
});

test("公开学习详情不被学习者入口守卫误判为创作入口", () => {
  for (const path of [
    "/media-tutor/public-token",
    "/text2lesson/public-token",
    "/flashcard/public-deck",
    "/learn/flashcards/public-deck"
  ]) {
    assert.equal(isPublicLearningSharePath(path), true, path);
    assert.equal(applicationRootForPath(path), null, path);
  }
  assert.equal(isPublicLearningSharePath("/media-tutor/creator/session-1"), false);
  assert.equal(isPublicLearningSharePath("/text2lesson/creator/session-1"), false);
  assert.equal(isPublicLearningSharePath("/flashcard/creator/session-1"), false);
});

test("账号和游客保留入口，未选择先选身份，学习者严格匹配授权根", () => {
  assert.equal(learnerEntryDecision("GUEST", "/experience/chat", []), "ALLOW");
  assert.equal(learnerEntryDecision("ACCOUNT", "/experience/chat", []), "ALLOW");
  assert.equal(learnerEntryDecision("UNSELECTED", "/experience/chat", []), "SELECT");
  assert.equal(
    learnerEntryDecision("LEARNER", "/experience/chat", ["experience-ai-chat"]),
    "ALLOW"
  );
  assert.equal(learnerEntryDecision("LEARNER", "/experience/chat", []), "DENY");
  assert.equal(
    learnerEntryDecision("LEARNER", "/tools/video-guide-practice-questions", ["video-guide-narration"]),
    "ALLOW"
  );
  assert.equal(
    learnerEntryDecision("LEARNER", "/tools/custom-writing", ["custom-writing"]),
    "DENY"
  );
  assert.equal(learnerEntryDecision("LEARNER", "/media-tutor/public-token", []), "ALLOW");
});

test("服务端身份解析区分游客、未选择、账号和学习者", async () => {
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    return apiResponse(500, { code: 50001, message: "不应请求", data: null });
  };
  assert.deepEqual(await profileApi.getWebProfile("/tools"), { mode: "GUEST" });
  assert.equal(requests, 0);

  globalThis.__task4Mocks.cookieStore.values.set("xueleai_user_refresh", "refresh-token");
  globalThis.fetch = async () =>
    apiResponse(403, { code: 40301, message: "请先选择使用身份", data: null });
  assert.deepEqual(await profileApi.getWebProfile("/tools"), { mode: "UNSELECTED" });

  globalThis.__task4Mocks.cookieStore.values.delete("xueleai_user_refresh");
  globalThis.__task4Mocks.cookieStore.values.set("xueleai_user_access", "access-token");
  globalThis.fetch = async () =>
    apiResponse(403, { code: 40301, message: "请先选择使用身份", data: null });
  assert.deepEqual(await profileApi.getWebProfile("/tools"), { mode: "UNSELECTED" });

  globalThis.fetch = async () =>
    apiResponse(403, { code: 40301, message: "请使用学习者身份访问学习首页", data: null });
  assert.deepEqual(await profileApi.getWebProfile("/tools"), { mode: "ACCOUNT" });

  const home = learnerHomePayload();
  globalThis.fetch = async () => apiResponse(200, { code: 0, message: "成功", data: home });
  assert.deepEqual(await profileApi.getWebProfile("/tools"), { mode: "LEARNER", home });
});

test("资源中心轻量列表请求携带身份 Cookie 供服务端按学习者授权过滤", async () => {
  globalThis.__task4Mocks.cookieStore.values.set("xueleai_user_access", "access-token");
  globalThis.__task4Mocks.cookieStore.values.set("xueleai_profile_context", "learner-context");
  let requestHeaders = new Headers();
  let requestUrl = "";
  globalThis.fetch = async (input, init) => {
    requestUrl = String(input);
    requestHeaders = new Headers(init?.headers);
    return apiResponse(200, { code: 0, message: "成功", data: [] });
  };

  await courseApi.getPublicCourseListing();

  assert.match(requestUrl, /\/public\/courses\?view=listing$/u);
  assert.match(requestHeaders.get("Cookie") ?? "", /xueleai_user_access=access-token/u);
  assert.match(requestHeaders.get("Cookie") ?? "", /xueleai_profile_context=learner-context/u);
});

test("资源中心首页请求轻量课程列表并携带身份 Cookie", async () => {
  globalThis.__task4Mocks.cookieStore.values.set("xueleai_user_access", "access-token");
  let requestUrl = "";
  let requestHeaders = new Headers();
  globalThis.fetch = async (input, init) => {
    requestUrl = String(input);
    requestHeaders = new Headers(init?.headers);
    return apiResponse(200, { code: 0, message: "成功", data: [] });
  };

  await courseApi.getPublicCourseListing();

  assert.match(requestUrl, /\/public\/courses\?view=listing$/u);
  assert.match(requestHeaders.get("Cookie") ?? "", /xueleai_user_access=access-token/u);
});

test("课程详情请求携带用户和管理员 Cookie 以解析待审预览权限", async () => {
  globalThis.__task4Mocks.cookieStore.values.set("xueleai_user_access", "user-token");
  globalThis.__task4Mocks.cookieStore.values.set("xueleai_admin_access", "admin-token");
  let requestHeaders = new Headers();
  globalThis.fetch = async (_input, init) => {
    requestHeaders = new Headers(init?.headers);
    return apiResponse(200, {
      code: 0,
      message: "成功",
      data: { state: "REVIEWING", courseId: "507f1f77bcf86cd799439011" }
    });
  };

  await courseApi.getCoursePage("507f1f77bcf86cd799439011");

  assert.match(requestHeaders.get("Cookie") ?? "", /xueleai_user_access=user-token/u);
  assert.match(requestHeaders.get("Cookie") ?? "", /xueleai_admin_access=admin-token/u);
});

test("资源中心页面不把 API 异常吞成成功空状态", async () => {
  globalThis.fetch = async () => {
    throw new Error("network down");
  };

  await assert.rejects(
    ResourceCenterPage(),
    (error: unknown) => error instanceof Error && error.message === "请求失败，请稍后重试。"
  );
});

test("学习首页服务端守卫使用安全继续目标映射三种非学习者状态", async () => {
  globalThis.__task4Mocks.cookieStore.values.set("xueleai_user_access", "access-token");

  globalThis.fetch = async () =>
    apiResponse(403, { code: 40301, message: "请先选择使用身份", data: null });
  await assert.rejects(
    profileApi.requireLearnerProfile("/learn?next=https://evil.example"),
    (error: Error & { destination?: string }) =>
      error.destination === "/select-profile?next=%2Flearn%3Fnext%3Dhttps%3A%2F%2Fevil.example"
  );

  globalThis.fetch = async () =>
    apiResponse(403, { code: 40301, message: "请使用学习者身份访问学习首页", data: null });
  await assert.rejects(
    profileApi.requireLearnerProfile("/learn"),
    (error: Error & { destination?: string }) => error.destination === "/dashboard"
  );

  globalThis.__task4Mocks.cookieStore.values.clear();
  await assert.rejects(
    profileApi.requireLearnerProfile("https://evil.example"),
    (error: Error & { destination?: string }) => error.destination === "/login"
  );
});

test("命名入口服务端守卫仅拒绝未授权学习者", async () => {
  globalThis.__task4Mocks.cookieStore.values.set("xueleai_user_access", "access-token");
  globalThis.fetch = async () =>
    apiResponse(200, {
      code: 0,
      message: "成功",
      data: learnerHomePayload(["experience-ai-chat"])
    });

  assert.equal((await profileApi.guardLearnerScenarioEntry("/experience/chat")).mode, "LEARNER");
  await assert.rejects(
    profileApi.guardLearnerScenarioEntry("/experience/image"),
    (error: Error & { destination?: string }) =>
      error.destination === "/learn?error=%E5%BD%93%E5%89%8D%E5%AD%A6%E4%B9%A0%E8%80%85%E6%9C%AA%E8%8E%B7%E5%BE%97%E6%AD%A4%E5%BA%94%E7%94%A8%E6%8E%88%E6%9D%83"
  );
  await assert.rejects(
    ZitiePage(),
    (error: Error & { destination?: string }) =>
      error.destination === "/learn?error=%E5%BD%93%E5%89%8D%E5%AD%A6%E4%B9%A0%E8%80%85%E6%9C%AA%E8%8E%B7%E5%BE%97%E6%AD%A4%E5%BA%94%E7%94%A8%E6%8E%88%E6%9D%83"
  );
});

test("认证响应中的唯一加固身份 Cookie 会按秒写入固定的 Next Cookie 属性", async () => {
  const headers = headerValues([
    "xueleai_user_access=access-token; Max-Age=900; Path=/; HttpOnly; SameSite=Lax",
    "xueleai_profile_context=signed.value; Max-Age=3600; Path=/; Expires=Fri, 14 Aug 2026 10:00:00 GMT; HttpOnly; Secure; SameSite=Lax; Domain=api.example",
    "xueleai_user_refresh=refresh-token; Max-Age=3600; Path=/; HttpOnly; SameSite=Lax"
  ]);

  await profileApi.applyProfileContextSetCookie(headers);

  assert.deepEqual(globalThis.__task4Mocks.cookieStore.setCalls, [
    {
      name: "xueleai_profile_context",
      value: "signed.value",
      options: {
        httpOnly: true,
        sameSite: "lax",
        secure: false,
        path: "/",
        maxAge: 3600
      }
    }
  ]);
});

test("单响应头回退也能读取身份 Cookie", async () => {
  await profileApi.applyProfileContextSetCookie({
    get(name: string) {
      return name.toLowerCase() === "set-cookie"
        ? "xueleai_profile_context=fallback-token; HttpOnly; SameSite=Lax; Path=/; Max-Age=60"
        : null;
    }
  });

  assert.equal(globalThis.__task4Mocks.cookieStore.setCalls[0]?.value, "fallback-token");
  assert.equal(globalThis.__task4Mocks.cookieStore.setCalls[0]?.options.maxAge, 60);
});

test("畸形或歧义身份 Cookie 会在任何写入前被拒绝", async () => {
  const invalidHeaders = [
    ["xueleai_profile_context=token; SameSite=Lax; Path=/; Max-Age=60"],
    ["wrong_name=token; HttpOnly; SameSite=Lax; Path=/; Max-Age=60"],
    [
      "xueleai_profile_context=one; HttpOnly; SameSite=Lax; Path=/; Max-Age=60",
      "xueleai_profile_context=two; HttpOnly; SameSite=Lax; Path=/; Max-Age=60"
    ],
    ["xueleai_profile_context=token; HttpOnly; HttpOnly; SameSite=Lax; Path=/; Max-Age=60"],
    ["xueleai_profile_context=token; HttpOnly; SameSite=Lax; SameSite=Lax; Path=/; Max-Age=60"],
    ["xueleai_profile_context=token; HttpOnly; SameSite=Lax; Path=/; Path=/; Max-Age=60"],
    ["xueleai_profile_context=token; HttpOnly; SameSite=Lax; Path=/; Max-Age=60; Max-Age=60"],
    ["xueleai_profile_context=token; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"],
    ["xueleai_profile_context=token; HttpOnly; SameSite=Lax; Path=/; Max-Age=1.5"],
    ["xueleai_profile_context=token\r\nInjected=yes; HttpOnly; SameSite=Lax; Path=/; Max-Age=60"],
    ["xueleai_profile_context=token\u0001; HttpOnly; SameSite=Lax; Path=/; Max-Age=60"]
  ];

  for (const values of invalidHeaders) {
    const writesBefore = globalThis.__task4Mocks.cookieStore.setCalls.length;
    await assert.rejects(profileApi.applyProfileContextSetCookie(headerValues(values)), /身份 Cookie/);
    assert.equal(globalThis.__task4Mocks.cookieStore.setCalls.length, writesBefore);
  }
});

test("首次选择学习者后按当前授权继续安全目标", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    return String(input).endsWith("/profiles/select")
      ? profileTransitionResponse("LEARNER", "learner-1")
      : apiResponse(200, {
          code: 0,
          message: "成功",
          data: learnerHomePayload(["english-guided-study-material"])
        });
  };

  await assert.rejects(
    profileApi.selectProfileAction(
      {},
      formData({ target: "LEARNER", learnerId: "learner-1", next: "/text2lesson" })
    ),
    (error: Error & { destination?: string }) => {
      assert.equal(error.destination, "/text2lesson");
      return true;
    }
  );

  assert.equal(requests.length, 2);
  assert.match(requests[0]?.url ?? "", /\/profiles\/select$/u);
  assert.match(requests[1]?.url ?? "", /\/profiles\/learner\/home$/u);
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    mode: "LEARNER",
    learnerId: "learner-1"
  });
  assert.equal(globalThis.__task4Mocks.cookieStore.setCalls[0]?.name, "xueleai_profile_context");
  assert.match(
    new Headers(requests[1]?.init?.headers).get("cookie") ?? "",
    /(?:^|; )xueleai_profile_context=next-token(?:;|$)/u
  );
});

test("首次选择学习者后不继续未授权目标", async () => {
  globalThis.fetch = async (input) => String(input).endsWith("/profiles/select")
    ? profileTransitionResponse("LEARNER", "learner-1")
    : apiResponse(200, {
        code: 0,
        message: "成功",
        data: learnerHomePayload([])
      });

  await assert.rejects(
    profileApi.selectProfileAction(
      {},
      formData({ target: "LEARNER", learnerId: "learner-1", next: "/text2lesson" })
    ),
    (error: Error & { destination?: string }) => error.destination === "/learn"
  );
});

test("主账号进入学习者只提交 learnerId 并写入安全 Cookie", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    return profileTransitionResponse("LEARNER", "learner-2");
  };

  await assert.rejects(
    profileApi.enterLearnerAction(
      {},
      formData({
        learnerId: "learner-2",
        password: "must-not-send",
        switchPassword: "must-not-send",
        mode: "ACCOUNT"
      })
    ),
    (error: Error & { destination?: string }) => error.destination === "/learn"
  );

  assert.match(requests[0]?.url ?? "", /\/profiles\/enter-learner$/u);
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), { learnerId: "learner-2" });
  assert.equal(globalThis.__task4Mocks.cookieStore.setCalls[0]?.options.httpOnly, true);
  assert.equal(
    globalThis.__task4Mocks.cookieStore.values.get("xueleai_user_access"),
    "profile-access-token"
  );
});

test("学习者切换只提交目标和六位切换密码", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    return profileTransitionResponse("LEARNER", "learner-2");
  };

  await assert.rejects(
    profileApi.switchLearnerAction(
      {},
      formData({ learnerId: "learner-2", switchPassword: "123456", password: "must-not-send" })
    ),
    (error: Error & { destination?: string }) => error.destination === "/learn"
  );

  assert.match(requests[0]?.url ?? "", /\/profiles\/switch-learner$/u);
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    learnerId: "learner-2",
    switchPassword: "123456"
  });
});

test("返回我的账号只提交主账号密码且切换密码不能替代", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    return profileTransitionResponse("ACCOUNT", null);
  };

  assert.deepEqual(
    await profileApi.returnToAccountAction({}, formData({ switchPassword: "123456" })),
    { error: "请输入主账号登录密码" }
  );
  assert.equal(requests.length, 0);

  await assert.rejects(
    profileApi.returnToAccountAction(
      {},
      formData({ password: "main-password", switchPassword: "must-not-send", learnerId: "must-not-send" })
    ),
    (error: Error & { destination?: string }) => error.destination === "/dashboard"
  );

  assert.match(requests[0]?.url ?? "", /\/profiles\/return-account$/u);
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), { password: "main-password" });
});

test("切换密码格式错误在请求前拒绝且不改 Cookie", async () => {
  globalThis.__task4Mocks.cookieStore.values.set("xueleai_profile_context", "current-token");
  const requests: string[] = [];
  globalThis.fetch = async (input) => {
    requests.push(String(input));
    return profileTransitionResponse("LEARNER", "learner-2");
  };

  for (const switchPassword of ["", "12345", "12345a", "1234567"]) {
    assert.deepEqual(
      await profileApi.switchLearnerAction(
        {},
        formData({ learnerId: "learner-2", switchPassword })
      ),
      { error: "切换密码必须为 6 位数字" }
    );
  }

  assert.deepEqual(requests, []);
  assert.equal(globalThis.__task4Mocks.cookieStore.values.get("xueleai_profile_context"), "current-token");
  assert.equal(globalThis.__task4Mocks.cookieStore.setCalls.length, 0);
});

test("两种错误密码保留原 Cookie 并显示各自固定中文错误", async () => {
  globalThis.__task4Mocks.cookieStore.values.set("xueleai_profile_context", "current-token");
  globalThis.fetch = async (input) => {
    const isReturn = String(input).endsWith("/profiles/return-account");
    return apiResponse(403, {
      code: 40301,
      message: isReturn ? "主账号密码错误" : "切换密码错误",
      data: null
    });
  };

  assert.deepEqual(
    await profileApi.switchLearnerAction(
      {},
      formData({ learnerId: "learner-2", switchPassword: "000000" })
    ),
    { error: "切换密码错误" }
  );
  assert.deepEqual(
    await profileApi.returnToAccountAction({}, formData({ password: "wrong-main-password" })),
    { error: "主账号密码错误" }
  );
  assert.equal(globalThis.__task4Mocks.cookieStore.values.get("xueleai_profile_context"), "current-token");
  assert.equal(globalThis.__task4Mocks.cookieStore.setCalls.length, 0);
});

test("切换成功响应缺少安全 Cookie 时不覆盖浏览器 Cookie", async () => {
  globalThis.__task4Mocks.cookieStore.values.set("xueleai_profile_context", "current-token");
  globalThis.fetch = async () =>
    apiResponse(200, {
      code: 0,
      message: "成功",
      data: { mode: "LEARNER", learnerId: "learner-2", learner: null }
    });

  assert.deepEqual(
    await profileApi.switchLearnerAction(
      {},
      formData({ learnerId: "learner-2", switchPassword: "123456" })
    ),
    { error: "学习者切换失败，请稍后再试" }
  );
  assert.equal(globalThis.__task4Mocks.cookieStore.values.get("xueleai_profile_context"), "current-token");
  assert.equal(globalThis.__task4Mocks.cookieStore.setCalls.length, 0);
});

test("身份选择的底层网络错误不会直接暴露给用户", async () => {
  globalThis.fetch = async () => {
    throw new Error("fetch failed: internal address");
  };

  assert.deepEqual(
    await profileApi.selectProfileAction({}, formData({ target: "ACCOUNT" })),
    { error: "身份选择失败，请稍后再试" }
  );
});

test("身份列表 401 带安全原目标回到登录且不吞掉 redirect", async () => {
  globalThis.fetch = async () =>
    apiResponse(401, { code: 40101, message: "登录状态已失效，请重新登录", data: null });

  await assert.rejects(
    profileApi.getProfileSelection("/text2lesson"),
    (error: Error & { destination?: string }) => {
      assert.equal(error.destination, "/login?next=%2Ftext2lesson");
      return true;
    }
  );
});

test("提交身份选择遇到 401 重新登录而不是返回表单错误", async () => {
  globalThis.fetch = async () =>
    apiResponse(401, { code: 40101, message: "登录状态已失效，请重新登录", data: null });

  await assert.rejects(
    profileApi.selectProfileAction({}, formData({ target: "ACCOUNT", next: "/text2lesson" })),
    (error: Error & { destination?: string }) => {
      assert.equal(error.destination, "/login?next=%2Ftext2lesson");
      return true;
    }
  );
  assert.equal(globalThis.__task4Mocks.cookieStore.setCalls.length, 0);
});

test("非认证 API 英文错误不会泄露到加载或表单错误", async () => {
  globalThis.fetch = async () =>
    apiResponse(500, { code: 50001, message: "Internal server error", data: null });

  await assert.rejects(
    profileApi.getProfileSelection("/text2lesson"),
    /身份列表加载失败，请稍后再试/
  );
  assert.deepEqual(
    await profileApi.selectProfileAction({}, formData({ target: "ACCOUNT", next: "/text2lesson" })),
    { error: "身份选择失败，请稍后再试" }
  );
});

test("首个当前用户检查 401 保留安全继续目标并拒绝危险目标", async () => {
  globalThis.fetch = async () =>
    apiResponse(401, { code: 40101, message: "登录状态已失效，请重新登录", data: null });

  const cases: Array<[unknown, string]> = [
    ["/text2lesson", "/login?next=%2Ftext2lesson"],
    ["https://evil.example", "/login"],
    ["/admin/users", "/login"],
    ["/select-profile?next=%2Ftext2lesson", "/login"],
    [undefined, "/login"]
  ];

  for (const [next, destination] of cases) {
    await assert.rejects(
      authActions.getCurrentUser(next),
      (error: Error & { destination?: string }) => {
        assert.equal(error.destination, destination);
        return true;
      }
    );
  }
});

test("三种用户认证在有学习账号时清旧身份并进入身份选择", async () => {
  const cases: Array<{
    action: typeof authActions.userLoginAction;
    entries: Record<string, string>;
  }> = [
    {
      action: authActions.userLoginAction,
      entries: { email: "user@example.com", password: "password", next: "/text2lesson" }
    },
    {
      action: authActions.registerAction,
      entries: {
        nickname: "用户",
        email: "user@example.com",
        password: "password",
        emailCode: "123456",
        next: "/text2lesson"
      }
    },
    {
      action: authActions.phoneLoginAction,
      entries: { phone: "13800138000", code: "123456", nickname: "用户", next: "/text2lesson" }
    }
  ];

  for (const { action, entries } of cases) {
    globalThis.__task4Mocks = createTask4Mocks();
    globalThis.fetch = async (input) =>
      String(input).endsWith("/profiles/selection")
        ? apiResponse(200, {
            code: 0,
            message: "成功",
            data: {
              account: {
                id: "user-1",
                label: "我的账号",
                nickname: "用户",
                avatarUrl: null,
                hasLoginPassword: true
              },
              learners: [learnerProfilePayload()]
            }
          })
        : apiResponse(200, {
            code: 0,
            message: "成功",
            data: {
              accessToken: "access-token",
              refreshToken: "refresh-token",
              accessTokenExpiresIn: 900,
              refreshTokenExpiresIn: 2592000
            }
          });
    await assert.rejects(action({}, formData(entries)), (error: Error & { destination?: string }) => {
      assert.equal(error.destination, "/select-profile?next=%2Ftext2lesson");
      return true;
    });
    assert.ok(globalThis.__task4Mocks.cookieStore.deleteCalls.includes("xueleai_profile_context"));
  }
});

test("三种用户认证在没有学习账号时自动进入我的账号并返回登录前页面", async () => {
  const cases: Array<{
    action: typeof authActions.userLoginAction;
    entries: Record<string, string>;
  }> = [
    {
      action: authActions.userLoginAction,
      entries: { email: "user@example.com", password: "password", next: "/text2lesson" }
    },
    {
      action: authActions.registerAction,
      entries: {
        nickname: "用户",
        email: "user@example.com",
        password: "password",
        emailCode: "123456",
        next: "/text2lesson"
      }
    },
    {
      action: authActions.phoneLoginAction,
      entries: { phone: "13800138000", code: "123456", nickname: "用户", next: "/text2lesson" }
    }
  ];

  for (const { action, entries } of cases) {
    globalThis.__task4Mocks = createTask4Mocks();
    const requests: Array<{ url: string; body: string }> = [];
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      requests.push({ url, body: String(init?.body ?? "") });

      if (url.endsWith("/profiles/selection")) {
        return apiResponse(200, {
          code: 0,
          message: "成功",
          data: {
            account: {
              id: "user-1",
              label: "我的账号",
              nickname: "用户",
              avatarUrl: null,
              hasLoginPassword: true
            },
            learners: []
          }
        });
      }
      if (url.endsWith("/profiles/select")) {
        return new Response(JSON.stringify({ code: 0, message: "成功", data: {} }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie":
              "xueleai_profile_context=account-context; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000"
          }
        });
      }

      return apiResponse(200, {
        code: 0,
        message: "成功",
        data: {
          accessToken: "access-token",
          refreshToken: "refresh-token",
          accessTokenExpiresIn: 900,
          refreshTokenExpiresIn: 2592000
        }
      });
    };

    await assert.rejects(action({}, formData(entries)), (error: Error & { destination?: string }) => {
      assert.equal(error.destination, "/text2lesson");
      return true;
    });
    assert.equal(requests.some((request) => request.url.endsWith("/profiles/selection")), true);
    assert.equal(
      requests.some(
        (request) => request.url.endsWith("/profiles/select") && request.body === '{"mode":"ACCOUNT"}'
      ),
      true
    );
    assert.equal(globalThis.__task4Mocks.cookieStore.values.get("xueleai_profile_context"), "account-context");
  }
});

test("学习账号可用主账号 ID、子账号 ID 和六位切换密码直接登录到学习者状态", async () => {
  let requestBody = "";
  globalThis.__task4Mocks.requestHeaders.set("x-real-ip", "203.0.113.88");
  globalThis.fetch = async (input, init) => {
    requestBody = String(init?.body ?? "");
    assert.equal(String(input).endsWith("/auth/learner-login"), true);
    assert.equal(new Headers(init?.headers).get("x-forwarded-for"), "203.0.113.88");
    const responseHeaders = new Headers({ "Content-Type": "application/json" });
    responseHeaders.append(
      "Set-Cookie",
      "xueleai_user_access=learner-access; Path=/; HttpOnly; SameSite=Lax; Max-Age=900"
    );
    responseHeaders.append(
      "Set-Cookie",
      "xueleai_user_refresh=learner-refresh; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000"
    );
    responseHeaders.append(
      "Set-Cookie",
      "xueleai_profile_context=learner-context; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000"
    );
    return new Response(
      JSON.stringify({
        code: 0,
        message: "成功",
        data: {
          user: { id: "user-1", accountId: "10000" },
          accessToken: "learner-access",
          refreshToken: "learner-refresh",
          accessTokenExpiresIn: 900,
          refreshTokenExpiresIn: 2592000
        }
      }),
      {
        status: 200,
        headers: responseHeaders
      }
    );
  };

  await assert.rejects(
    authActions.learnerLoginAction({}, formData({
      accountId: "10000",
      learnerId: "100",
      switchPassword: "123456"
    })),
    (error: Error & { destination?: string }) => error.destination === "/learn"
  );
  assert.equal(
    requestBody,
    '{"accountId":"10000","learnerId":"100","switchPassword":"123456"}'
  );
  assert.equal(globalThis.__task4Mocks.cookieStore.values.get("xueleai_user_access"), "learner-access");
  assert.equal(globalThis.__task4Mocks.cookieStore.values.get("xueleai_user_refresh"), "learner-refresh");
  assert.equal(globalThis.__task4Mocks.cookieStore.values.get("xueleai_profile_context"), "learner-context");
});

test("学习账号登录在请求前校验数字位数且错误密码不写入任何会话 Cookie", async () => {
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    return apiResponse(400, {
      code: 40003,
      message: "主账号 ID、子账号 ID 或切换密码错误",
      data: null
    });
  };

  assert.deepEqual(
    await authActions.learnerLoginAction({}, formData({
      accountId: "9999",
      learnerId: "99",
      switchPassword: "123"
    })),
    { error: "请输入正确的主账号 ID、子账号 ID 和 6 位切换密码" }
  );
  assert.equal(requests, 0);

  assert.deepEqual(
    await authActions.learnerLoginAction({}, formData({
      accountId: "9999999999",
      learnerId: "100",
      switchPassword: "123456"
    })),
    { error: "请输入正确的主账号 ID、子账号 ID 和 6 位切换密码" }
  );
  assert.equal(requests, 0);

  assert.deepEqual(
    await authActions.learnerLoginAction({}, formData({
      accountId: "10000",
      learnerId: "100",
      switchPassword: "000000"
    })),
    { error: "主账号 ID、子账号 ID 或切换密码错误" }
  );
  assert.equal(requests, 1);
  assert.equal(globalThis.__task4Mocks.cookieStore.setCalls.length, 0);
});

test("学习账号退出只有服务端验证切换密码成功后才清理本地登录态", async () => {
  globalThis.__task4Mocks.cookieStore.values.set("xueleai_user_access", "access");
  globalThis.__task4Mocks.cookieStore.values.set("xueleai_user_refresh", "refresh");
  globalThis.__task4Mocks.cookieStore.values.set("xueleai_profile_context", "learner-context");

  assert.deepEqual(
    await authActions.learnerLogoutAction({}, formData({ switchPassword: "123" })),
    { error: "切换密码必须为 6 位数字" }
  );
  assert.deepEqual(globalThis.__task4Mocks.cookieStore.deleteCalls, []);

  globalThis.fetch = async () =>
    apiResponse(400, { code: 40003, message: "切换密码错误", data: null });
  assert.deepEqual(
    await authActions.learnerLogoutAction({}, formData({ switchPassword: "000000" })),
    { error: "切换密码错误" }
  );
  assert.deepEqual(globalThis.__task4Mocks.cookieStore.deleteCalls, []);

  globalThis.fetch = async () =>
    apiResponse(500, { code: 50001, message: "Prisma error：数据库异常", data: null });
  assert.deepEqual(
    await authActions.learnerLogoutAction({}, formData({ switchPassword: "123456" })),
    { error: "退出登录失败，请稍后再试" }
  );
  assert.deepEqual(globalThis.__task4Mocks.cookieStore.deleteCalls, []);

  let requestBody = "";
  globalThis.fetch = async (_input, init) => {
    requestBody = String(init?.body ?? "");
    return apiResponse(200, { code: 0, message: "成功", data: {} });
  };
  await assert.rejects(
    authActions.learnerLogoutAction({}, formData({ switchPassword: "123456" })),
    (error: Error & { destination?: string }) => error.destination === "/"
  );
  assert.equal(requestBody, '{"switchPassword":"123456"}');
  assert.deepEqual(
    globalThis.__task4Mocks.cookieStore.deleteCalls.sort(),
    ["xueleai_profile_context", "xueleai_user_access", "xueleai_user_refresh"].sort()
  );
});

test("用户退出清理三类 Cookie，管理员登录保持原行为", async () => {
  globalThis.__task4Mocks.cookieStore.values.set("xueleai_user_access", "access");
  globalThis.__task4Mocks.cookieStore.values.set("xueleai_user_refresh", "refresh");
  await assert.rejects(authActions.userLogoutAction(), (error: Error & { destination?: string }) => {
    assert.equal(error.destination, "/");
    return true;
  });
  assert.deepEqual(
    globalThis.__task4Mocks.cookieStore.deleteCalls.sort(),
    ["xueleai_profile_context", "xueleai_user_access", "xueleai_user_refresh"].sort()
  );

  globalThis.__task4Mocks = createTask4Mocks();
  await assert.rejects(
    authActions.adminLoginAction({}, formData({ email: "admin@example.com", password: "password" })),
    (error: Error & { destination?: string }) => {
      assert.equal(error.destination, "/admin");
      return true;
    }
  );
  assert.deepEqual(
    globalThis.__task4Mocks.cookieStore.setCalls.map((write) => write.name),
    ["xueleai_admin_access", "xueleai_admin_refresh"]
  );
  assert.equal(globalThis.__task4Mocks.cookieStore.deleteCalls.includes("xueleai_profile_context"), false);
});

function createTask4Mocks(): Task4Mocks {
  const values = new Map<string, string>();
  const setCalls: CookieWrite[] = [];
  const deleteCalls: string[] = [];

  return {
    cookieStore: {
      values,
      setCalls,
      deleteCalls,
      getAll: () => Array.from(values, ([name, value]) => ({ name, value })),
      get: (name) => (values.has(name) ? { name, value: values.get(name)! } : undefined),
      set(name, value, options) {
        values.set(name, value);
        setCalls.push({ name, value, options });
      },
      delete(name) {
        values.delete(name);
        deleteCalls.push(name);
      }
    },
    requestHeaders: new Headers(),
    redirects: [],
    revalidations: []
  };
}

function headerValues(values: string[]) {
  return {
    getSetCookie: () => values,
    get: () => values[0] ?? null
  };
}

function formData(entries: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(entries)) {
    data.set(name, value);
  }
  return data;
}

async function proxyLocation(path: string, cookie?: string) {
  const response = await proxy(new NextRequest(`https://xueleai.test${path}`, {
    headers: cookie ? { cookie } : undefined
  }));
  return response.headers.get("location");
}

function apiResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function learnerProfilePayload() {
  return {
    id: "learner-1",
    nickname: "小明",
    grade: "GRADE_1",
    gradeLabel: "一年级",
    avatarUrl: null,
    status: "ACTIVE",
    deactivatedAt: null,
    createdAt: "2026-08-25T00:00:00.000Z",
    updatedAt: "2026-08-25T00:00:00.000Z"
  };
}

function profileTransitionResponse(mode: "ACCOUNT" | "LEARNER", learnerId: string | null) {
  const responseHeaders = new Headers({ "Content-Type": "application/json" });
  responseHeaders.append(
    "Set-Cookie",
    "xueleai_profile_context=next-token; HttpOnly; SameSite=Lax; Path=/; Max-Age=3600"
  );
  responseHeaders.append(
    "Set-Cookie",
    "xueleai_user_access=profile-access-token; HttpOnly; SameSite=Lax; Path=/; Max-Age=900"
  );

  return new Response(
    JSON.stringify({
      code: 0,
      message: "成功",
      data: {
        mode,
        learnerId,
        learner: learnerId
          ? {
              id: learnerId,
              nickname: "学习者",
              grade: "GRADE_1",
              gradeLabel: "一年级",
              avatarUrl: null
            }
          : null
      }
    }),
    {
      status: 200,
      headers: responseHeaders
    }
  );
}

function learnerHomePayload(scenarioSlugs: string[] = []) {
  return {
    learner: {
      id: "learner-1",
      nickname: "小明",
      grade: "GRADE_1",
      gradeLabel: "一年级",
      avatarUrl: null
    },
    scenarios: scenarioSlugs.map((slug, index) => ({
      id: `scenario-${index + 1}`,
      name: slug,
      slug,
      description: null
    })),
    courses: [],
    recentRecords: []
  };
}
