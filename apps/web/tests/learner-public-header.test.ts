import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/navigation") {
      return {
        shortCircuit: true,
        url: `data:text/javascript,${encodeURIComponent(
          "export function usePathname(){return '/learn'} export function useRouter(){return {refresh(){}}} export function redirect(){throw new Error('unexpected redirect')}"
        )}`
      };
    }

    return nextResolve(specifier, context);
  }
});

const { UserAccountMenu } = await import("../src/components/shell/user-account-menu.js");

test("公共页头在学习者头像左侧展示学习中心入口", () => {
  const markup = renderToStaticMarkup(React.createElement(UserAccountMenu, {
    user: {
      id: "user-1",
      accountId: "10000",
      nickname: "主账号",
      avatarUrl: null,
      email: "owner@example.com",
      phone: null,
      phoneVerifiedAt: null,
      status: "ACTIVE"
    },
    learners: [],
    profile: {
      mode: "LEARNER",
      home: {
        learner: {
          id: "learner-1",
          nickname: "小明",
          grade: "GRADE_2",
          gradeLabel: "二年级",
          avatarUrl: null
        },
        scenarios: [],
        courses: [],
        recentRecords: []
      }
    },
    enterLearnerAction: async () => ({}),
    returnToAccountAction: async () => ({}),
    switchLearnerAction: async () => ({})
  }));

  const centerLinkIndex = markup.indexOf('href="/learn/center"');
  const avatarButtonIndex = markup.indexOf('aria-haspopup="menu"');

  assert.ok(centerLinkIndex >= 0, "公共学习者页头应包含学习中心链接");
  assert.ok(avatarButtonIndex >= 0, "公共学习者页头应包含当前学习者头像按钮");
  assert.ok(centerLinkIndex < avatarButtonIndex, "学习中心入口应位于学习者头像左侧");
});
