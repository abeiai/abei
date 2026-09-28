import {
  Bot,
  BookOpen,
  BrainCircuit,
  Building2,
  ClipboardCheck,
  FileText,
  FolderTree,
  Home,
  Image,
  LayoutTemplate,
  LayoutDashboard,
  Menu,
  Mail,
  Package,
  Palette,
  PanelsTopLeft,
  Mic2,
  Newspaper,
  ReceiptText,
  CreditCard,
  Activity,
  ScrollText,
  Settings,
  ShieldCheck,
  Tags,
  Type,
  Users,
  type LucideIcon
} from "lucide-react";

export const articles = [
  {
    slug: "demo",
    title: "如何搭建内容型 AI SaaS 的第一批页面",
    summary: "从首页、文章、单页、用户中心和后台管理开始，让产品先具备可访问的运营界面。",
    category: "产品设计",
    status: "已发布",
    publishedAt: "2026-05-08",
    readTime: "6 分钟",
    author: "AI SaaS 团队",
    content: [
      "第一阶段的关键不是把所有业务逻辑一次做完，而是先让团队和用户都能看见产品的基本形态。",
      "前台页面负责建立信任和内容入口，用户中心负责承接登录后的使用预期，管理后台负责让运营人员知道内容管理会如何展开。",
      "当前版本已经接入真实数据库、登录会话和基础 CMS，可以在保留路由和布局的前提下继续扩展运营能力。"
    ]
  },
  {
    slug: "content-operations",
    title: "内容工具站为什么要先做好 CMS 入口",
    summary: "内容是获取自然流量和承接用户意图的基础，CMS 入口应当尽早进入产品骨架。",
    category: "内容运营",
    status: "已发布",
    publishedAt: "2026-05-06",
    readTime: "5 分钟",
    author: "运营团队",
    content: [
      "内容型工具站的首页、文章列表和单页详情共同构成第一批可索引、可分享、可运营的页面。",
      "简单 CMS 不需要复杂工作流，但需要清晰的分类、文章状态、slug 和 SEO 字段预留。"
    ]
  },
  {
    slug: "dashboard-shell",
    title: "用户中心第一版需要呈现哪些信息",
    summary: "用户中心先展示账号状态、点数概览和最近使用记录，后续再接入真实任务。",
    category: "用户体验",
    status: "草稿",
    publishedAt: "2026-05-04",
    readTime: "4 分钟",
    author: "产品团队",
    content: [
      "用户中心是登录闭环后的第一落点，第一版应当避免空白屏。",
      "在真实 AI 能力接入前，可以使用状态卡片和最近记录让页面保持可解释。"
    ]
  }
];

export const pages = [
  {
    slug: "about",
    title: "关于我们",
    summary: "我们正在构建面向中国市场的 AI SaaS 与内容工具站底座。",
    status: "已发布",
    updatedAt: "2026-05-08",
    content: [
      "AI SaaS 是一个以简体中文体验为核心的产品底座，第一阶段聚焦前台页面、登录闭环、后台管理和基础 CMS。",
      "项目已预留支付宝、微信支付、点数钱包和 AI 任务编排能力，当前版本优先保证第一阶段闭环可靠。"
    ]
  },
  {
    slug: "terms",
    title: "服务条款",
    summary: "服务条款草稿，用于补充正式运营协议。",
    status: "草稿",
    updatedAt: "2026-05-01",
    content: ["这里会展示正式服务条款、用户责任、内容使用范围和平台规则。"]
  }
];

export const categories = [
  {
    name: "产品设计",
    slug: "product-design",
    articleCount: 8,
    status: "启用",
    updatedAt: "2026-05-08"
  },
  {
    name: "内容运营",
    slug: "content-operations",
    articleCount: 12,
    status: "启用",
    updatedAt: "2026-05-07"
  },
  {
    name: "用户体验",
    slug: "user-experience",
    articleCount: 5,
    status: "停用",
    updatedAt: "2026-05-04"
  }
];

export type AdminNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export type AdminNavGroup = {
  key: string;
  label: string;
  icon: LucideIcon;
  items: AdminNavItem[];
};

export const adminHomeNavItem: AdminNavItem = {
  href: "/admin",
  label: "后台首页",
  icon: LayoutDashboard
};

export const adminFrontendNavItem: AdminNavItem = {
  href: "/",
  label: "返回前台",
  icon: Home
};

export const adminNavGroups: AdminNavGroup[] = [
  {
    key: "content",
    label: "内容管理",
    icon: FolderTree,
    items: [
      {
        href: "/admin/categories",
        label: "文章分类",
        icon: FolderTree
      },
      {
        href: "/admin/articles",
        label: "文章管理",
        icon: Newspaper
      },
      {
        href: "/admin/pages",
        label: "单页管理",
        icon: FileText
      },
      {
        href: "/admin/tags",
        label: "内容标签",
        icon: Tags
      },
      {
        href: "/admin/media",
        label: "素材资源",
        icon: Image
      }
    ]
  },
  {
    key: "appearance",
    label: "主题外观",
    icon: LayoutTemplate,
    items: [
      {
        href: "/admin/themes",
        label: "主题模板",
        icon: Palette
      },
      {
        href: "/admin/modules",
        label: "模块管理",
        icon: LayoutTemplate
      },
      {
        href: "/admin/page-compositions",
        label: "页面编排",
        icon: PanelsTopLeft
      },
      {
        href: "/admin/menus",
        label: "菜单管理",
        icon: Menu
      }
    ]
  },
  {
    key: "business",
    label: "业务管理",
    icon: Users,
    items: [
      {
        href: "/admin/users",
        label: "用户运营",
        icon: Users
      },
      {
        href: "/admin/memberships",
        label: "会员管理",
        icon: Package
      },
      {
        href: "/admin/referrals",
        label: "推荐记录",
        icon: Users
      },
      {
        href: "/admin/products",
        label: "产品管理",
        icon: Package
      },
      {
        href: "/admin/organizations",
        label: "企业账号",
        icon: Building2
      },
      {
        href: "/admin/payments",
        label: "支付订单",
        icon: ReceiptText
      }
    ]
  },
  {
    key: "learning-materials",
    label: "学习材料",
    icon: BookOpen,
    items: [
      {
        href: "/admin/course-reviews",
        label: "资源审核",
        icon: ClipboardCheck
      },
      {
        href: "/admin/learning-materials/textbooks",
        label: "教材管理",
        icon: BookOpen
      },
      {
        href: "/admin/fonts",
        label: "字体管理",
        icon: Type
      }
    ]
  },
  {
    key: "ai",
    label: "智能中枢",
    icon: BrainCircuit,
    items: [
      {
        href: "/admin/ai-tasks",
        label: "任务清单",
        icon: BrainCircuit
      },
      {
        href: "/admin/ai/usage",
        label: "用量成本",
        icon: Activity
      },
      {
        href: "/admin/ai/config",
        label: "AI 配置",
        icon: Settings
      },
      {
        href: "/admin/audio/voices",
        label: "音色库",
        icon: Mic2
      },
      {
        href: "/admin/audio/safety",
        label: "语音安全",
        icon: ShieldCheck
      },
      {
        href: "/admin/ai-scenarios",
        label: "AI 场景",
        icon: Bot
      },
      {
        href: "/admin/ai/providers",
        label: "模型配置",
        icon: Bot
      },
    ]
  },
  {
    key: "config",
    label: "其他配置",
    icon: Settings,
    items: [
      {
        href: "/admin/settings",
        label: "系统设置",
        icon: Settings
      },
      {
        href: "/admin/payment-config",
        label: "支付配置",
        icon: CreditCard
      },
      {
        href: "/admin/send",
        label: "邮件短信",
        icon: Mail
      },
      {
        href: "/admin/system/env-check",
        label: "环境检查",
        icon: Settings
      },
      {
        href: "/admin/operation-logs",
        label: "操作日志",
        icon: ScrollText
      }
    ]
  }
];

export const adminNavItems: AdminNavItem[] = [
  adminHomeNavItem,
  ...adminNavGroups.flatMap((group) => group.items),
  adminFrontendNavItem
];

export const dashboardActivities = [
  "账号资料已创建，当前会话由真实登录接口维护",
  "点数钱包已接入，可查看充值、冻结、消耗和释放流水",
  "体验区任务已接入，可在任务历史查看结果与点数消耗"
];
