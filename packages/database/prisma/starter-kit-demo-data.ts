export const starterKitDemoArticleCategories = [
  {
    name: "Starter Kit 指南",
    slug: "starter-kit-guide",
    description: "面向新开发者的 AI SaaS Starter Kit 使用、发布和运营指南。",
    sortOrder: 1
  },
  {
    name: "内容增长",
    slug: "content-growth",
    description: "围绕内容型工具站、SEO 和中文增长运营的示例文章。",
    sortOrder: 2
  },
  {
    name: "AI 写作",
    slug: "ai-writing",
    description: "AI 写作工具、Prompt 设计和内容生产工作流。",
    sortOrder: 3
  },
  {
    name: "语音工具",
    slug: "voice-product",
    description: "语音合成、声音设计、声音复刻和音色库运营说明。",
    sortOrder: 4
  }
] as const;

export const starterKitDemoArticles = [
  {
    categorySlug: "starter-kit-guide",
    title: "用 AI 写作场景站启动第一个 SaaS",
    slug: "starter-kit-ai-writing-site",
    summary: "从首页、体验区、文章、用户中心和后台配置开始，把 Starter Kit 调整成可演示的 AI 写作站。",
    content:
      "这个示例站点展示了一条最短可运营路径：用户从首页进入体验区或场景应用，登录后提交任务，再在用户中心查看任务历史和点数流水。\n\n作为 Starter Kit，第一步不应该追求复杂插件市场或多租户，而是让新项目能快速替换品牌、内容、场景应用和模型配置。\n\n上线前建议完成三件事：配置真实域名和备案信息，接入真实 AI Provider，并关闭本地模拟支付能力。",
    seoTitle: "AI 写作场景站 Starter Kit 示例",
    seoDescription: "了解如何基于 AI SaaS Starter Kit 启动一个可演示、可登录、可配置模型的中文 AI 写作场景站。"
  },
  {
    categorySlug: "content-growth",
    title: "内容型 AI SaaS 的第一批页面应该有什么",
    slug: "content-ai-saas-first-pages",
    summary: "首页、价格页、文章列表、单页和体验区入口是内容型 AI SaaS 早期最值得优先打磨的界面。",
    content:
      "内容型 AI SaaS 的第一批页面不需要像大型平台一样复杂，但必须让用户理解产品、看到体验能力、知道价格，并能找到基础信任信息。\n\n建议优先准备：一个清晰首页，一个体验区入口，一个价格与点数说明页，三到五篇入门文章，以及关于我们、隐私政策和服务条款。\n\n后台 CMS 的意义在于让这些内容可以被运营持续更新，而不是每次都改代码发布。",
    seoTitle: "内容型 AI SaaS 第一批页面清单",
    seoDescription: "整理中文内容型 AI SaaS 在 MVP 阶段应该优先准备的首页、体验页、价格页、文章和单页。"
  },
  {
    categorySlug: "ai-writing",
    title: "场景应用如何设计输入表单",
    slug: "ai-tool-template-input-schema",
    summary: "好的场景应用会把 Prompt 变量变成清晰表单，让用户知道该填什么、为什么填。",
    content:
      "场景应用不是简单把一个大文本框扔给用户。更好的方式是把关键变量拆成主题、目标用户、语气、输出格式等字段，让提交前的预期更明确。\n\n在这个 Starter Kit 中，场景应用可以使用 inputSchema 描述表单字段，后端负责校验必填项，前台页面负责动态渲染。\n\n这样做的好处是：开发者可以通过 JSON 或代码注册新应用，而不必为每个应用单独写一套页面。",
    seoTitle: "场景应用输入表单设计",
    seoDescription: "介绍 AI SaaS Starter Kit 中 inputSchema、Prompt 模板和场景应用表单的设计方式。"
  },
  {
    categorySlug: "voice-product",
    title: "音色库如何管理生成语音和复刻声音",
    slug: "voice-library-demo-guide",
    summary: "说明系统音色、用户音色、声音授权、审核状态和语音任务记录之间的关系。",
    content:
      "音色库是语音能力产品化后的核心入口。系统音色适合快速生成通用旁白，用户音色则来自声音设计或声音复刻。\n\n声音复刻必须保存授权声明，未审核或被禁用的音色不能用于新的语音合成任务。管理员可以在后台查看样本、授权记录、任务记录和操作日志。\n\n示例数据只包含说明文案和场景应用说明，不包含真实用户声音样本、公众人物声音或任何真实 API Key。",
    seoTitle: "音色库管理示例",
    seoDescription: "了解 AI SaaS Starter Kit 中音色库、声音授权、语音审核和语音任务记录的基础设计。"
  }
] as const;

export const starterKitDemoPages = [
  {
    title: "关于示例站",
    slug: "about",
    content:
      "这是 AI SaaS Starter Kit 内置的中文 AI 写作场景站示例。\n\n你可以替换站点名称、Logo、主题主色、导航菜单、文章内容、单页内容和场景应用，把它改造成自己的产品原型。",
    seoTitle: "关于 AI SaaS Starter Kit 示例站",
    seoDescription: "了解 AI SaaS Starter Kit 示例站的用途和可替换内容。"
  },
  {
    title: "服务条款",
    slug: "terms",
    content:
      "本页面是 Starter Kit 示例服务条款，不构成正式法律文本。\n\n正式上线前，请根据你的公司主体、服务范围、付费规则、退款规则和用户数据处理方式，替换为经审核的正式条款。",
    seoTitle: "服务条款",
    seoDescription: "AI SaaS Starter Kit 示例服务条款。"
  },
  {
    title: "隐私政策",
    slug: "privacy",
    content:
      "本页面是 Starter Kit 示例隐私政策，不构成正式法律文本。\n\n正式上线前，请明确说明你收集哪些用户信息、如何使用、如何保存、如何删除，以及第三方服务的调用范围。",
    seoTitle: "隐私政策",
    seoDescription: "AI SaaS Starter Kit 示例隐私政策。"
  },
  {
    title: "语音能力说明",
    slug: "voice-tools",
    content:
      "本示例页说明语音合成、声音设计和声音复刻的产品化方式。\n\n语音合成适合文章朗读、课程讲稿、短视频口播和客服欢迎语。声音设计可以通过文字描述生成新的品牌音色。声音复刻仅允许上传本人声音或已获授权的声音样本，并需要保存授权声明。\n\n示例站不会内置真实声音样本，也不会写入真实 Provider API Key。",
    seoTitle: "语音能力说明",
    seoDescription: "介绍语音合成、声音设计、声音复刻能力和使用边界。"
  },
  {
    title: "语音安全协议",
    slug: "voice-safety",
    content:
      "使用语音生成和声音复刻能力时，用户必须承诺不冒充他人、不用于诈骗、不侵犯他人声音权益、不生成违法违规内容。\n\n上传声音样本前，应确认该声音属于本人，或已获得声音权利人的明确授权。平台可根据安全策略对复刻音色进行审核、拒绝、禁用或删除。\n\n本页面为 Starter Kit 示例协议，正式上线前应结合业务范围和法律意见替换为正式文本。",
    seoTitle: "语音安全协议",
    seoDescription: "AI SaaS Starter Kit 示例语音安全协议，覆盖声音授权、复刻审核和合规使用要求。"
  }
] as const;

export const starterKitDemoSystemConfigs = [
  {
    key: "siteName",
    label: "站点名称",
    value: "AI 写作工具站",
    description: "Starter Kit 示例站点名称。",
    isPublic: true,
    sortOrder: 10
  },
  {
    key: "activeThemeTemplate",
    label: "当前主题模板",
    value: "default",
    description: "Starter Kit 示例默认使用当前前台风格。",
    isPublic: true,
    sortOrder: 17
  },
  {
    key: "homeTitle",
    label: "首页标题",
    value: "可直接演示的中文 AI 写作工具站",
    description: "Starter Kit 示例首页首屏标题。",
    isPublic: true,
    sortOrder: 19
  },
  {
    key: "homeDescription",
    label: "首页描述",
    value: "内置首页、工具、文章、单页、用户中心和后台配置，新项目可以从这里替换品牌和内容。",
    description: "Starter Kit 示例首页首屏描述。",
    isPublic: true,
    sortOrder: 20
  },
  {
    key: "footerText",
    label: "Footer 文案",
    value: "这是一个可清理、可替换的 AI SaaS Starter Kit 示例站。",
    description: "Starter Kit 示例页脚文案。",
    isPublic: true,
    sortOrder: 18
  },
  {
    key: "audioDemoPricingNote",
    label: "语音模型价格说明",
    value: "语音任务统一按后台语音模型价格预估、冻结和结算；失败任务会释放冻结点数。",
    description: "Starter Kit 语音工具 Demo 的模型价格说明文案。",
    isPublic: true,
    sortOrder: 320
  }
] as const;

export const starterKitLegacyDemoArticleSlugs = ["demo"];
export const starterKitLegacyDemoCategorySlugs = ["product-design"];
export const starterKitDemoPaymentOrderPrefix = "DEMO-";
