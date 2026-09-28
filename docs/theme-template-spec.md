# 主题模板开发规范

本文件说明 AI SaaS 平台的前台主题模板规则。主题模板用于切换前台视觉风格，不改变平台功能、数据模型、业务接口和用户使用记录。

## 1. 目标

主题模板要满足三点：

1. 可切换：后台可选择当前启用的前台主题。
2. 可解耦：主题只控制视觉样式，不改业务流程。
3. 可扩展：新增主题时不影响已有主题、菜单、CMS、页面编排、支付、AI 任务和计费扣点。

当前内置主题：

| key | 名称 | 定位 |
| --- | --- | --- |
| `default` | 默认风格 | 从当前前台页面提取的内容型 SaaS 风格。 |
| `blue-tech` | 蓝色科技 | 蓝色主视觉、冷白画布、科技感网格背景。 |

## 2. 技术结构

主题模板由三部分组成：

1. 主题定义：`apps/web/src/lib/theme-templates.ts`
   - 维护主题 key、名称、描述、预览色、特性和 CSS token。
2. 主题应用：`apps/web/src/components/shell/public-shell.tsx`
   - 读取公开系统配置 `activeThemeTemplate`。
   - 把主题 token 注入 `PublicShell` 的 CSS 变量。
3. 主题管理：`/admin/themes`
   - 管理员选择主题并保存到 `system_configs.activeThemeTemplate`。

后端配置定义在：

```text
apps/api-core/src/system-config/system-config.service.ts
apps/api-core/src/system-config/dto/update-system-config.dto.ts
```

## 3. 设计边界

主题模板只能影响：

1. CSS 变量。
2. 前台公共头部、底部、按钮、卡片、徽标等展示层样式。
3. 页面编排模块的前台渲染外观。

主题模板不得影响：

1. 路由结构。
2. 登录注册逻辑。
3. 用户、组织、钱包、订单、点数和扣费。
4. CMS 内容结构。
5. AI Provider、模型选择、任务创建和计费规则。
6. 后台管理功能。

主题切换后，用户历史任务、订单、余额、用量记录和文章内容必须保持不变。

## 4. Token 规则

每个主题必须至少提供以下 CSS 变量：

```text
--background
--foreground
--card
--card-foreground
--popover
--popover-foreground
--primary
--primary-foreground
--secondary
--secondary-foreground
--muted
--muted-foreground
--accent
--accent-foreground
--destructive
--border
--input
--ring
--radius
```

可选扩展变量：

```text
--theme-card-shadow
--theme-header-shadow
```

新增变量必须有默认回退值，不能让未使用该变量的主题出现空样式。

## 5. 新增主题流程

新增主题时按以下顺序：

1. 在 `theme-templates.ts` 中添加主题定义。
2. 在 `SystemConfigService` 的 `activeThemeTemplate` 校验中加入新 key。
3. 如需特殊视觉效果，在 `globals.css` 中使用：

```css
.xueleai-public-shell[data-public-theme="new-theme"] {
  ...
}
```

4. 在 `/admin/themes` 页面确认主题卡片可展示。
5. 运行验证：

```bash
pnpm --filter @xueleai/web typecheck
pnpm --filter @xueleai/api-core typecheck
```

如果新增路由或改动 Next.js Server Component，需额外运行：

```bash
pnpm --filter @xueleai/web build
```

## 6. 当前默认主题提取说明

`default` 主题来自当前前台风格：

1. 浅灰背景 `#f5f5f5`。
2. 白色卡片。
3. 暖黑主色 `#292524`。
4. 圆角按钮。
5. 内容型页面排版。

该主题保留 `themePrimaryColor` 的兼容能力：当后台系统设置里修改主题主色时，只对 `default` 主题的 `--primary` 和 `--ring` 生效。

## 7. 蓝色科技主题说明

`blue-tech` 是一套与默认风格明显不同的主题：

1. 主色为蓝色 `#0b63f6`。
2. 背景为冷白蓝 `#f3f8ff`。
3. 使用细网格背景表达科技感。
4. 卡片增加轻量蓝色阴影。
5. 不改变页面内容和功能入口。

## 8. 验收标准

主题模板功能完成后，应满足：

1. 后台 `/admin/themes` 可选择默认风格或蓝色科技。
2. 保存后前台公共页面和体验区页面的公共外观立即变化。
3. 菜单、页面编排模块、CMS 内容、价格页和体验区功能仍可正常访问。
4. 切换主题不会新增、删除或修改业务数据。
