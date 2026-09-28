import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../src/components/ai/provider-model-manager.tsx", import.meta.url),
  "utf8"
);
const providerDetailSource = readFileSync(
  new URL("../src/app/admin/ai/providers/[id]/page.tsx", import.meta.url),
  "utf8"
);

test("后台编辑阶梯价格时保留官方价格来源和计费说明", () => {
  assert.match(source, /pricingConfigFromForm\(\s*formData,\s*pricingMode,\s*pricingUnit,\s*tiers,\s*videoVariants,\s*row\.pricingConfig\s*\)/u);
  assert.match(source, /source:\s*originalConfig\?\.mode === "TOKEN_TIERED" \? originalConfig\.source : undefined/u);
  assert.match(source, /note:\s*originalConfig\?\.mode === "TOKEN_TIERED" \? originalConfig\.note : undefined/u);
});

test("非语音模型详情页展示 Provider 配置", () => {
  assert.match(providerDetailSource, /ProviderConfigCard provider=\{provider\}/u);
  assert.match(providerDetailSource, /ProviderModelManager provider=\{provider\}/u);
});
