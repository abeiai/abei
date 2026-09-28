# 031–100 后续任务索引

## 阶段 7：上线前硬化

```text
031 补齐核心单元测试
032 补齐 Auth / CMS / Wallet / AI Task e2e 测试
033 增加接口限流
034 增加登录失败保护
035 增加管理员操作日志
036 增加全局请求日志
037 增加错误日志
038 增加数据库备份方案
039 增加健康检查接口
040 检查所有敏感环境变量
```

对应文档：

```text
docs/development-plan/07-production-hardening.md
```

## 阶段 8：生产部署能力

```text
041 编写 production Dockerfile
042 编写 docker-compose.prod.yml
043 配置 Nginx 反向代理
044 配置 HTTPS
045 配置生产环境变量模板
046 配置数据库 migration 部署流程
047 配置日志目录挂载
048 配置上传目录或对象存储预留
049 配置备份脚本
050 编写 DEPLOYMENT.md
```

对应文档：

```text
docs/development-plan/08-production-deployment.md
```

## 阶段 9：真实支付宝 / 微信支付接入

```text
051 接入支付宝沙箱支付
052 接入支付宝正式支付
053 接入微信支付 Native 扫码
054 接入微信支付回调验签
055 支付异常重试与订单对账
056 支付后台订单列表
057 手动补单功能
058 支付日志查看
```

对应文档：

```text
docs/development-plan/09-real-payment.md
```

## 阶段 10：真实 AI Provider 接入

```text
059 AI Provider 配置模型
060 API Key 加密存储
061 FastAPI 接入 OpenAI-compatible provider
062 NestJS 调用 FastAPI
063 返回 usage
064 根据 usage 计算实际点数
065 AI 调用失败自动释放冻结点数
066 AI 调用日志
067 AI 任务后台列表
068 AI 任务详情页
```

对应文档：

```text
docs/development-plan/10-real-ai-provider.md
```

## 阶段 11：后台运营能力增强

```text
069 用户列表
070 用户详情
071 用户禁用 / 启用
072 用户钱包查看
073 管理员手动加减点数
074 订单列表
075 订单详情
076 AI 任务列表
077 AI 任务详情
078 管理员操作日志
079 系统设置页面真实可用
```

对应文档：

```text
docs/development-plan/11-operations-admin.md
```

## 阶段 12：CMS 增强与内容增长

```text
080 媒体上传
081 接入对象存储
082 Markdown 编辑器升级
083 文章标签
084 文章封面管理
085 SEO 字段增强
086 sitemap.xml
087 robots.txt
088 文章预览
089 定时发布
090 首页内容区块配置
```

对应文档：

```text
docs/development-plan/12-cms-growth-seo.md
```

## 阶段 13：产品化前台增强

本阶段为前台转化增强，建议作为 101–110 或使用独立编号：

```text
091-A 价格页
092-A 功能页
093-A 使用案例页
094-A AI 工具列表页
095-A AI 工具详情页
096-A 用户任务历史
097-A 用户点数流水
098-A 用户个人设置
099-A 首页转化增强
100-A 注册和充值引导优化
```

对应文档：

```text
docs/development-plan/13-product-frontend.md
```

## 阶段 14：高级 AI 能力

```text
091 SSE 流式输出
092 AI 场景 Prompt 模板变量
093 用户历史任务
094 文件上传解析
095 知识库基础模型
096 RAG 检索
097 多模型配置
098 模型 fallback
099 Agent 工具调用
100 工作流编排
```

对应文档：

```text
docs/development-plan/14-advanced-ai.md
```

## 建议执行顺序

```text
031–040 上线前硬化
041–050 生产部署
051–058 真实支付
059–068 真实 AI
069–079 后台运营
080–090 CMS 与 SEO 增长
091-A–100-A 前台产品化
091–100 高级 AI
```

注意：

前台产品化和高级 AI 的编号有重叠风险。  
如果使用 issue 系统或项目管理工具，建议将产品化前台任务编号改为 101–110。
