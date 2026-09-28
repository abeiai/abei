import assert from "node:assert/strict";
import test from "node:test";
import { Children, isValidElement, type ReactElement } from "react";

test("统计代码通过独立脚本节点注入且不会接管整个 head", async () => {
  let analyticsModule: typeof import("../src/components/shell/analytics-code") | null = null;

  try {
    analyticsModule = await import("../src/components/shell/analytics-code");
  } catch {
    // The assertion below keeps the first TDD run as a focused behavior failure.
  }

  assert.ok(analyticsModule, "缺少安全的统计代码注入组件");

  const analyticsCode = [
    '<script async src="https://example.com/analytics.js"></script>',
    '<script>window.__analyticsLoaded = true;</script>'
  ].join("");
  const scripts = analyticsModule.parseAnalyticsScripts(analyticsCode);

  assert.deepEqual(scripts, [
    {
      attributes: {
        async: "",
        src: "https://example.com/analytics.js"
      },
      content: ""
    },
    {
      attributes: {},
      content: "window.__analyticsLoaded = true;"
    }
  ]);

  const elements = Children.toArray(analyticsModule.AnalyticsCode({ code: analyticsCode }));
  assert.equal(elements.length, 2);

  for (const element of elements) {
    assert.ok(isValidElement(element));
    const scriptElement = element as ReactElement<{
      strategy?: string;
    }>;
    assert.equal((scriptElement.type as { __nextScript?: boolean }).__nextScript, true);
    assert.equal(scriptElement.props.strategy, "beforeInteractive");
  }
});
