# abei

本项目以 xueleai 的 `origin/main` 已提交快照为技术底座，包含 Next.js Web、NestJS API、FastAPI AI Gateway、PostgreSQL 和 Redis。导入来源：`abeiai/xueleai`，提交 `28bfb1f7`（2026-09-27）。上游原始说明见 [README.xueleai.md](README.xueleai.md)。

## Docker 启动

首次启动需要 Docker Desktop。项目根目录的私有 `.env` 包含独立生成的数据库密码和应用密钥，不应提交。运行：

```bash
docker compose up -d --build
```

入口：[http://localhost:3600](http://localhost:3600)，健康检查：[http://localhost:3600/healthz](http://localhost:3600/healthz)。数据库 migration 在启动时自动执行。查看状态与停止：

```bash
docker compose ps
docker compose down
```

Docker 项目名为 `abei`，入口容器名为 `abei`。端口均在指定范围内：3600 HTTP、3601 Web、3602 API、3603 AI Gateway、3604 PostgreSQL、3605 Redis。仅入口、PostgreSQL 和 Redis 映射到本机回环地址；其余服务通过 Compose 内部网络连接。数据保存在 `abei` 专属 Docker 卷中，与 xueleai 完全隔离。

## 绘本 R2 存储

绘本新生成的插画、角色图和讲解语音写入 Cloudflare R2 的 `abeiai` 存储桶。请在私有 `.env` 中设置 `S3_ENDPOINT`、`S3_BUCKET=abeiai`、`S3_ACCESS_KEY_ID`、`S3_SECRET_ACCESS_KEY`、`S3_PUBLIC_BASE_URL`，并建议设置 `S3_KEY_PREFIX=picture-books/`。公开域名需能读取该存储桶中的对象。配置完成后重建 `api-core` 容器。已有绘本素材不会自动搬迁。

上游的 `docker-compose.prod.yml` 和发布脚本仍保留供参考，其 xueleai 配置不用于 abei 的本地运行。
## abei 公众号扫码登录

微信登录采用「临时二维码 → 关注/扫码 → 原浏览器自动登录」，无需在公众号回复确认码。公众号事件在服务端验签解密，扫码状态仅由发起扫码的浏览器上下文领取，不向浏览器返回 OpenID。网站应用 OAuth 的 authorize/callback 已移除。已导入的同公众号 OpenID 对应原用户；未匹配身份先选择绑定已有手机号/邮箱账号或创建新账号，不能扫码后自动建号。

扫码即登录有二维码替换风险：用户若扫描他人展示的登录二维码，可能把自己的账号登录到对方浏览器；应只扫描自己打开的登录页二维码。

在 abei 配置中填写 `WECHAT_APP_ID`、`WECHAT_APP_SECRET`、`WECHAT_MP_CALLBACK_TOKEN`、43 位 `WECHAT_MP_ENCODING_AES_KEY`、`WECHAT_MP_ORIGINAL_ID`，并将 `APP_BASE_URL` 设置为用户实际访问的同源 HTTPS 地址。消息入口为 `https://你的域名/api/auth/wechat/mp/events`，只接收已验签的安全模式加密消息。`WECHAT_MP_LOGIN_ENABLED` 和 `WECHAT_MP_REGISTRATION_ENABLED` 默认均为 false；旧用户身份导入、独立测试及旧公众号消息接管完成后再按需开启。

账号绑定支持已有邮箱与密码，或真实手机号短信。微信绑定/注册要求 `ALIYUN_SMS` 标准短信，验证码与本次发送记录绑定；开发默认码和目前无法证明本条发送记录的 `ALIYUN_DYPNS` 均不可用于微信关联。普通手机登录原有 DYPNS 入口保留。未注册手机号仅在明确选择创建且注册开关开启后生成零余额钱包，不重发旧账号奖励。验证失败后需重新扫码。

本次代码不执行生产二维码创建、公众号消息地址/模式变更或旧库写入。真实公众号权限、消息接管、既有菜单/自动回复与共享 token 策略须在另行授权的发布联调中核验，支付 OAuth/回调保持原有业务。无需新增数据库 migration 或真实数据 seed。上游 `docker-compose.prod.yml` 为历史部署模板，abei 使用根 Compose 和 `deploy/abei`，服务端口限于 3600–3680。

## 生产部署

主域名为 `https://abeiai.com`（旧域名 `https://new.abeiai.com` 的页面自动跳转），使用独立 `docker-compose.abei-prod.yml`；完整发布与数据同步说明见 [abei 生产发布](docs/ops/abei-production.md)。
