# 微信公众号与网站应用登录设计

## 目标

为 `xueleai.com` 增加两种微信授权登录入口，并将同一微信用户统一到现有 `users` 账户：

- 微信内浏览器使用微信公众号 OAuth2 网页授权。
- 普通桌面浏览器使用微信开放平台网站应用扫码登录。
- 两种渠道通过同一开放平台账号下的 `unionid` 识别同一用户。
- 登录成功后继续使用现有 JWT、刷新令牌 Cookie、用户中心和钱包体系。

不修改 `abeiai.com`，不修改微信公众号服务器配置、公众号消息回调或现有微信支付回调，也不使用扫码关注公众号登录。

## 当前系统约束

现有 Prisma `User` 模型映射到 `users` 表，已经承载 JWT、刷新令牌、钱包、课程、点数和 AI 业务关系，并已有公众号 OpenID 字段 `wechatOpenId`。`email`、`passwordHash` 和 `nickname` 当前为必填字段，手机验证码注册已经采用内部占位邮箱和随机密码模式。

现有支付模块的微信 OAuth 只用于给已登录用户绑定 JSAPI 支付所需的公众号 OpenID。本功能新增独立的用户登录授权流程，不改变支付模块路由和行为。

## 公开入口与渠道选择

登录页 `/login` 保留邮箱和手机登录，在表单下方增加“微信登录”按钮。按钮携带经过前端约束的 `next`，跳转到：

```text
GET /api/auth/wechat/authorize?next=/dashboard
```

NestJS 控制器路径为 `GET /auth/wechat/authorize`，线上经过全局 `/api` 前缀后形成上述公开地址。后端根据 `User-Agent` 选择渠道：

- 包含 `MicroMessenger`：微信公众号 OAuth2。
- 普通桌面浏览器：微信开放平台网站应用登录。
- 普通手机浏览器且不在微信内：返回登录页并展示“请在微信中打开，或在电脑上扫码登录”。

授权回调统一为：

```text
GET /api/auth/wechat/callback?code=...&state=...
```

公众号后台网页授权域名和开放平台网站应用授权回调域均配置为 `xueleai.com`。完整回调地址由 `APP_BASE_URL` 与固定路径 `/api/auth/wechat/callback` 组合，生产环境必须得到 `https://xueleai.com/api/auth/wechat/callback`。

## 微信授权流程

### 微信公众号

授权入口使用：

```text
https://open.weixin.qq.com/connect/oauth2/authorize
```

参数包括公众号 AppID、编码后的回调地址、`response_type=code`、`scope=snsapi_userinfo` 和随机 `state`。回调后依次调用：

```text
https://api.weixin.qq.com/sns/oauth2/access_token
https://api.weixin.qq.com/sns/userinfo
```

读取公众号 OpenID、UnionID、昵称和头像。

### 开放平台网站应用

桌面授权入口使用：

```text
https://open.weixin.qq.com/connect/qrconnect
```

参数包括网站应用 AppID、编码后的回调地址、`response_type=code`、`scope=snsapi_login` 和随机 `state`。微信展示官方二维码，扫码确认后回调同一接口，再从微信 OAuth 接口读取网站应用 OpenID、UnionID、昵称和头像。

两种渠道都要求返回非空 UnionID。由于公众号和网站应用已经绑定在同一个微信开放平台账号下，UnionID 是跨渠道统一账号的唯一依据；缺少 UnionID 时拒绝创建用户，避免产生无法自动合并的重复账户。

## State 与重定向安全

每次授权生成 32 字节密码学随机数并编码为不超过微信参数限制的 Base64URL `state`。服务端执行以下两种绑定：

1. 将 `state` 的 SHA-256 哈希作为 Redis key，保存渠道、清洗后的 `next` 和创建时间，有效期 10 分钟。
2. 将原始 `state` 写入 `HttpOnly`、`Secure`、`SameSite=Lax` 临时 Cookie，Cookie 路径限制为 `/api/auth/wechat`，有效期同为 10 分钟。

回调必须以常量时间比较查询参数与 Cookie，并原子读取且删除 Redis 记录。任一记录缺失、过期、不一致或已消费都拒绝登录，同时清除临时 Cookie。这样既保证 `state` 随机且一次性使用，也把授权结果绑定到发起授权的浏览器，防止登录 CSRF。

`next` 仅允许以单斜线开头的站内路径，拒绝协议地址、`//`、`/admin` 及其子路径。无效值统一回退到 `/dashboard`。

## 数据模型

不新增独立的 `xueleai_user` 表。继续使用现有 `users` 表，并新增：

```prisma
wechatWebOpenId String? @unique
wechatUnionId   String? @unique
```

现有字段含义保持为：

```text
wechatOpenId    微信公众号 OpenID
wechatWebOpenId 微信开放平台网站应用 OpenID
wechatUnionId   同一开放平台账号下的 UnionID
nickname        用户昵称
avatarUrl       用户头像地址
createdAt       创建时间
updatedAt       更新时间
```

需要新增一次向前兼容的 Prisma migration，只增加两个可空列和唯一索引，不重置或删除现有生产数据。

## 用户解析与创建

回调获得微信身份后，在同一事务边界内按以下规则解析用户：

1. 通过 `wechatUnionId` 查找用户。
2. 通过当前渠道的 OpenID 查找用户；公众号使用 `wechatOpenId`，网站应用使用 `wechatWebOpenId`。
3. 两种查询均命中同一用户时，补齐当前渠道 OpenID、UnionID、缺失头像和 `lastLoginAt`。
4. 仅 OpenID 命中已有用户时，为其补齐 UnionID。这兼容此前由微信 JSAPI 支付授权绑定公众号 OpenID 的用户。
5. 仅 UnionID 命中已有用户时，为其补齐当前渠道 OpenID。
6. UnionID 与渠道 OpenID 分别命中两个不同用户时，拒绝自动合并并返回客服联系提示，避免错误合并钱包、课程和点数。
7. 均未命中时创建普通 `User` 和关联 `Wallet`。使用基于 UnionID 的不可逆摘要生成 `@users.xueleai.local` 内部占位邮箱，密码使用随机值哈希存储，昵称和头像取微信资料。
8. 唯一索引并发冲突时重新读取 UnionID 对应用户，不创建第二个账户。
9. 用户状态不是 `ACTIVE` 时拒绝登录。

已有用户的非空昵称不被微信资料覆盖，避免抹掉用户主动修改的资料；头像仅在现有头像为空时补齐。首次创建用户使用微信昵称，昵称缺失时使用“微信用户”。

## 会话

用户解析完成后复用 `AuthService` 现有用户会话创建逻辑：

- 签发当前 `USER` JWT。
- 创建并持久化刷新令牌哈希。
- 写入现有 `xueleai_user_access` 和 `xueleai_user_refresh` Cookie。
- Cookie 保持 `HttpOnly`、`Secure`、`SameSite=Lax` 和站点根路径。
- 更新 `lastLoginAt`。
- 跳转到 Redis state 中保存的安全 `next`，默认 `/dashboard`。

## 配置与密钥

新增服务器环境变量：

```text
WECHAT_APP_ID
WECHAT_APP_SECRET
WECHAT_OPEN_APP_ID
WECHAT_OPEN_APP_SECRET
```

公众号与网站应用 AppSecret 只能存在于本地未跟踪环境文件和服务器 `.env.production`，通过 Docker Compose 传入 `api-core`。示例环境文件只保留空值，不写入真实凭据。凭据不进入 Web 容器、前端 bundle、数据库系统配置、日志、测试快照或 Git 历史。

此前在对话中提供过公众号 AppSecret，上线前应完成轮换。由于轮换会影响同一公众号的其他调用方，`abeiai.com` 的同步配置由用户单独处理，本项目发布流程不得修改该站。

## 错误处理

微信授权入口和回调是浏览器跳转接口，不返回常规 JSON 页面。预期错误统一跳转回 `/login`，只携带固定错误枚举，例如：

```text
wechat_error=config
wechat_error=state
wechat_error=denied
wechat_error=upstream
wechat_error=identity_conflict
wechat_error=disabled
wechat_error=mobile_browser
```

登录页将枚举映射为固定简体中文提示，不接受或渲染微信返回的任意错误文案。服务端可以记录微信 `errcode` 和内部请求标识，但不得记录 AppSecret、授权 code、OAuth access token、refresh token、OpenID、UnionID 或完整请求 URL。

微信 token 和用户信息请求使用有限超时并校验 HTTP 状态、响应结构和微信 `errcode`。上游超时、拒绝、无效响应均转换为统一中文提示。授权入口和回调沿用全局限流，并增加适合登录流程的端点限额。

## 登录页表现

登录页原有邮箱、手机登录和返回首页操作保持不变。在现有登录方式下方加入分隔文字“其他登录方式”和带微信品牌图标的全宽按钮“微信登录”。项目已有 Font Awesome 品牌图标依赖，使用其微信图标，不新增图标依赖。

页面服务端读取 `wechat_error` 并映射提示。按钮保留已清洗的 `next`；授权成功后与邮箱、手机登录到达相同目标页面。

## 测试与验收

后端自动化测试覆盖：

- 微信内浏览器生成公众号授权 URL、正确 scope 和回调地址。
- 桌面浏览器生成网站应用扫码授权 URL、正确 scope 和回调地址。
- 普通手机浏览器返回固定错误。
- state 随机性、Cookie 绑定、Redis TTL、篡改、过期和重复消费。
- 微信 token/userinfo 成功、超时、HTTP 错误、微信错误码和缺少 UnionID。
- UnionID 命中、渠道 OpenID 回填、首次创建用户和钱包。
- UnionID/OpenID 身份冲突、禁用用户和并发唯一键冲突。
- 成功回调写入现有会话 Cookie并执行安全跳转。
- 外部、双斜线和后台 `next` 被拒绝。

前端自动化测试覆盖：

- 微信登录按钮和正确授权入口。
- `next` 保留与过滤。
- 固定错误枚举到简体中文提示的映射。

完成后运行 Prisma 校验、针对性 API/Web 测试、两个应用的 typecheck、lint 和 build。部署后的真实验收必须分别完成：

1. 在微信内打开 `/login`，完成公众号授权并进入用户中心。
2. 在普通桌面浏览器打开 `/login`，完成官方二维码扫码并进入用户中心。
3. 两次登录调用 `/api/auth/me` 返回同一个用户 ID。
4. 现有邮箱、手机登录和微信 JSAPI 支付授权继续可用。

## 不在本次范围

- 不修改 `abeiai.com`。
- 不修改微信公众号服务器配置或消息回调。
- 不实现扫码关注公众号登录。
- 不自动合并两个已经各自拥有业务数据的用户。
- 不新增 OAuth 管理后台、解绑页面或其他第三方登录。
- 不修改微信支付配置和支付回调。
