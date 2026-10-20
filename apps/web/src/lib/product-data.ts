import {
  BookOpenText,
  Bot,
  CreditCard,
  Database,
  FileText,
  Film,
  LayoutDashboard,
  Lightbulb,
  Megaphone,
  Mic2,
  PenLine,
  ReceiptText,
  Rocket,
  Search,
  Settings,
  Sparkles,
  Tags,
  WalletCards
} from "lucide-react";

export const pricingFaqs = [
  {
    question: "点数会过期吗？",
    answer: "第一版不设置点数有效期，后续如调整会在站内公告和订单页面提前说明。"
  },
  {
    question: "生成失败会扣点吗？",
    answer: "AI 任务会先冻结预估点数，失败后自动释放冻结点数，成功后按实际消耗结算。"
  },
  {
    question: "当前支持哪些支付方式？",
    answer: "第一阶段只支持支付宝和微信支付，不接入 Stripe、Paddle 或国际支付。"
  },
  {
    question: "适合什么团队使用？",
    answer: "适合中小学生家庭、教培老师和专辑内容团队，把现有素材整理成讲解稿、课件、练习和可分享学习资料。"
  }
];

export const featureGroups = [
  {
    title: "素材整理",
    description: "文案、字幕、音视频和图片统一整理。",
    icon: BookOpenText,
    items: ["文案资料整理", "图片内容识别", "音视频字幕承接", "学习主题归档"]
  },
  {
    title: "AI 生成工坊",
    description: "生成导学课件、逐句讲解、音频和练习。",
    icon: Sparkles,
    items: ["视频导学", "英文带学", "讲解音频", "练习巩固"]
  },
  {
    title: "点数与记录",
    description: "点数消耗、任务历史和结果回看。",
    icon: WalletCards,
    items: ["支付宝", "微信支付", "任务历史", "生成结果回看"]
  },
  {
    title: "内容管理",
    description: "文章、单页、教材和工具入口统一维护。",
    icon: LayoutDashboard,
    items: ["CMS 管理", "教材资源", "用户管理", "系统配置"]
  }
];

export const useCaseGroups = [
  {
    title: "家长辅学",
    description: "课文、图片和视频转成可讲可练的材料。",
    icon: PenLine,
    examples: ["课文讲解", "错题思路", "亲子共读材料"]
  },
  {
    title: "学生自学",
    description: "英文材料、视频片段和课堂笔记逐步拆解。",
    icon: Rocket,
    examples: ["英文带学", "听读练习", "知识点复盘"]
  },
  {
    title: "老师备课",
    description: "讲义、素材和录课片段快速结构化。",
    icon: Lightbulb,
    examples: ["课件提纲", "课堂讲解稿", "随堂练习"]
  },
  {
    title: "亲子视频导学",
    description: "视频、音频和字幕生成分阶段导学课件。",
    icon: Film,
    examples: ["自主视听", "互动讲解", "词语巩固", "跟读训练"]
  },
  {
    title: "英文带学",
    description: "图片或英文文本生成逐句讲解、音频和练习。",
    icon: BookOpenText,
    examples: ["图片识别", "英语水平选择", "逐句精讲", "练习巩固"]
  }
];

export const productTools = [
  {
    slug: "copywriting",
    title: "学习文案整理",
    category: "学习材料",
    summary: "输入课文、笔记或讲解需求，生成结构清晰的学习说明文案。",
    description:
      "适合快速整理课文讲解、知识点说明、专辑开场和复习提示。生成前会提示预估点数，提交后可在任务历史中回看。",
    costCredits: 120,
    isAvailable: true,
    icon: Megaphone,
    placeholder: "例如：把这段五年级科学笔记整理成适合家长讲解的 3 分钟讲稿。",
    inputLabel: "学习材料需求",
    resultLabel: "整理结果",
    tips: ["写清年级和学科", "补充孩子当前掌握情况", "需要长文时分段提交更稳定"]
  },
  {
    slug: "article-outline",
    title: "专辑大纲助手",
    category: "学习材料",
    summary: "根据学习主题拆解专辑结构、讲解层级和练习要点。",
    description: "适合专辑讲义、导学课件和复习材料的前期结构规划。",
    costCredits: 80,
    isAvailable: false,
    icon: FileText,
    placeholder: "例如：围绕初中英语一般过去时，生成一份 20 分钟讲解大纲。",
    inputLabel: "专辑主题",
    resultLabel: "大纲结果",
    tips: ["适合先确定讲解顺序", "可配合导学课件生成", "后续接入真实 AI 场景"]
  },
  {
    slug: "seo-title",
    title: "SEO 标题优化",
    category: "增长转化",
    summary: "为文章或场景应用页生成更适合点击和检索的中文标题。",
    description: "适合优化文章标题、页面标题和摘要卖点。",
    costCredits: 60,
    isAvailable: false,
    icon: Search,
    placeholder: "例如：把“AI 文案工具介绍”优化成 5 个更适合搜索的标题。",
    inputLabel: "原始标题或主题",
    resultLabel: "标题建议",
    tips: ["标题不做夸张承诺", "关键词自然出现", "后续和 CMS SEO 字段联动"]
  }
];

export const toolCategories = Array.from(new Set(productTools.map((tool) => tool.category))).map(
  (category) => ({
    name: category,
    tools: productTools.filter((tool) => tool.category === category)
  })
);

export const conversionSteps = [
  {
    title: "注册账号",
    description: "保存材料和生成记录。",
    icon: Tags,
    href: "/register"
  },
  {
    title: "放入素材",
    description: "选择视频、英文、语音或图片。",
    icon: Bot,
    href: "/experience/chat"
  },
  {
    title: "充值点数",
    description: "支付宝或微信补充点数。",
    icon: CreditCard,
    href: "/pricing"
  },
  {
    title: "沉淀专辑",
    description: "回看课件、音频和练习。",
    icon: ReceiptText,
    href: "/dashboard/tasks"
  }
];

export const dashboardQuickLinks = [
  {
    title: "体验区",
    description: "AI 对话、语音、图片和视频。",
    icon: Sparkles,
    href: "/experience/chat"
  },
  {
    title: "视频导学",
    description: "视频、音频和字幕转导学课件。",
    icon: Film,
    href: "/media-tutor"
  },
  {
    title: "英文带学",
    description: "英文文本转逐句讲解和练习。",
    icon: BookOpenText,
    href: "/text2lesson"
  },
  {
    title: "导学课件",
    description: "查看课件并复制分享页。",
    icon: BookOpenText,
    href: "/dashboard/video-guides"
  },
  {
    title: "任务历史",
    description: "查看 AI 和音频任务。",
    icon: ReceiptText,
    href: "/dashboard/tasks"
  },
  {
    title: "音色库",
    description: "管理系统音色和复刻音色。",
    icon: Mic2,
    href: "/dashboard/voices"
  },
  {
    title: "知识库",
    description: "沉淀学习资料。",
    icon: Database,
    href: "/dashboard/knowledge"
  },
  {
    title: "点数充值",
    description: "余额、订单和充值。",
    icon: WalletCards,
    href: "/dashboard/billing"
  },
  {
    title: "个人资料",
    description: "昵称、密码和账号设置。",
    icon: Settings,
    href: "/dashboard/profile"
  }
];

export function getProductTool(slug: string) {
  return productTools.find((tool) => tool.slug === slug);
}
