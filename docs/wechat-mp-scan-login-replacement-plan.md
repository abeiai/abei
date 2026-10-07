# abei 公众号扫码登录替换方案

日期：2026-10-07。

## 推荐方式

新版尚未上线，不存在需要兼容的网站微信登录用户。**彻底移除新版现有微信 OAuth 登录方式，以同一公众号的临时场景二维码登录替代**：未关注用户扫码后关注，已关注用户直接扫码，在公众号内确认本次登录，原浏览器自动完成登录并进入身份选择页面。公众号身份以 `AppID + OpenID` 为依据，UnionID 可选，不保留网站应用登录或过渡绑定入口。

复用新版用户、钱包、会话 Cookie 和身份选择流程；先导入旧公众号身份，保证老用户登录后继续访问原有作品、订单和权益。二维码是本次登录的临时凭证，不能使用固定的公众号关注图片。需要承接的是旧版用户数据及公众号消息业务。

方案已按用户授权实施登录代码替换，按鉴权严格模式执行测试与独立审查；未修改旧生产库、公众号服务器地址、真实密钥或旧站。真实公众号联调仍待发布前独立验收。

## 旧版实际流程

| 步骤 | 旧版实现 | 证据 |
| --- | --- | --- |
| 生成二维码 | `GET /v1/user/code/mp/` 创建 `uuid.uuid1().hex`，场景为 `AI_<key>_AI`，返回二维码图片地址及 key | [旧用户接口](../abeiai/abei-backend-main/app_user/views.py)、[路由](../abeiai/abei-backend-main/app_user/urls.py) |
| 微信接口 | `WXjsApi` 使用 `WECHAT_APP_ID/SECRET` 对应的公众号；获取 `stable_token`，调用 `qrcode/create`，类型 `QR_STR_SCENE`，默认有效期 3600 秒 | [微信封装](../abeiai/abei-backend-main/utils/WXjsapi.py) |
| 接收事件 | `/callback/mp` 匹配 `EventKey` 中的场景，将查询参数中的 OpenID 写入以 key 为键的 Django cache | [回调](../abeiai/abei-backend-main/callback/views.py)、[总路由](../abeiai/abei-backend-main/abei/urls.py) |
| 查询扫码结果 | `GET /v1/user/check/?key=...` 将缓存中的 OpenID 返回浏览器 | 旧用户接口 |
| 登录 | `POST /v1/user/login/` 接收浏览器传入的 OpenID，查找已启用用户并返回 token；未命中时返回未登录资料 | 旧用户接口、[序列化器](../abeiai/abei-backend-main/app_user/serializers.py) |
| 注册 | 新用户走独立手机号注册/验证流程，保存公众号 OpenID；用户资料可由旧昵称/头像资源填充 | 同上 |

本地后端已经证明这是一条公众号场景事件链路，不是开放平台网站扫码 OAuth。旧前端不在本次核验范围，不能由后端源码推断其确切轮询频率或所有手机交互。

旧版不能原样复制：

- 查询接口把 OpenID 交给浏览器，登录接口又直接信任传入的 OpenID；源码未将这两个步骤绑定到同一浏览器或一次性消费证明。
- 回调 GET 验证直接返回 `echostr`；POST 使用源码内的校验 Token，未见安全模式解密和严谨的事件类型/接收账号校验。
- `EventKey` 用非锚定正则匹配，没有分别规范处理 `subscribe` 的 `qrscene_` 前缀和 `SCAN` 场景，也未见 first-scan 原子绑定或完整状态机。
- 缓存结果没有显式采用二维码期限，也未见消费后失效逻辑；UUID1 不是适合认证挑战的随机生成方式。旧日志还记录完整事件及查询参数。

这些是本地实现的缺口，未对旧站进行请求、攻击验证或权限测试。

## 新版需要替换的部分

原新版已移除的 `wechat-oauth.client.ts` 在微信内走 `snsapi_userinfo`，桌面走 `snsapi_login/qrconnect`，普通手机浏览器直接返回错误。其配置要求公众号和网站应用两组凭据都存在，用户信息解析还要求 UnionID 必填。

新版 [身份服务](../apps/api-core/src/auth/wechat-auth.service.ts) 保留 UnionID/OpenID 冲突检查、禁用用户检查、用户和钱包创建；[AuthService](../apps/api-core/src/auth/auth.service.ts) 的 `startUserSession` 建立当前登录态。原 `wechat-oauth-state.store.ts` 已替换为 [扫码状态存储](../apps/api-core/src/auth/wechat-mp.store.ts)，继续使用 Redis TTL、随机挑战和一次性消费。

| 保留并复用 | 替换或新增 |
| --- | --- |
| 邮箱/手机号登录、身份选择、当前会话 Cookie、安全 next 过滤 | 微信按钮由跳转授权改为打开二维码面板 |
| 用户启用状态检查、身份唯一性和冲突处理 | 公众号二维码客户端、稳定 access token 缓存、消息回调 |
| `User.wechatMpOpenId`、可空的 `wechatUnionId`、已有钱包 | UnionID 可空的公众号身份解析和旧用户匹配 |
| 现有账号/钱包及首次创建事务边界 | 扫码挑战状态、原浏览器绑定、公众号内确认、一次性完成接口 |

新版现有接口没有公众号消息接收处理。`rawBody: true` 也不能代替 XML 解析，需要为新回调单独设置受限的原始 XML/text 接收规则：[API 启动入口](../apps/api-core/src/main.ts)。

本方案接替上游 [微信 OAuth 设计](superpowers/specs/2026-08-08-wechat-oauth-login-design.md) 的登录方式决策；后续实现时更新对应规格与测试，保留历史设计的背景。微信 JSAPI 支付授权是另一条业务链路，不随登录替换删除。

实现时删除仅用于现有微信 OAuth 登录的 `authorize/callback` 接口、网站应用 WEB 分支、授权客户端、OAuth state/Cookie及对应旧测试，改用公众号扫码接口和测试；不新增兼容路由。清理登录专用的 `WECHAT_OPEN_APP_ID/WECHAT_OPEN_APP_SECRET` 配置和引用，保留公众号凭据及必要的共享用户/会话逻辑。

## 用户交互

1. 点击“微信登录”，当前登录页展示临时二维码、有效时间和刷新按钮，主提示为“微信扫码，首次使用请关注公众号”。
2. 微信扫码产生关注事件或已关注用户的扫码事件；服务端绑定身份，页面显示“请在公众号回复：登录 123456”，其中数字是本次登录的随机确认码。
3. 公众号被动回复提示“请返回你正在登录的阿贝页面查看确认码，回复「登录 确认码」”。公众号消息**不直接提供这个确认码**，避免用户仅看到二维码就被自动登录到陌生浏览器。
4. 用户在公众号回复正确确认码，已匹配账号的浏览器显示“确认成功，正在登录”，随后进入 `/select-profile?next=...`，沿用当前登录后的实际路径。未匹配身份先显示“绑定已有账号”或“创建新账号”，不能直接自动建号。
5. 过期、取消或错误次数达到上限时，显示“二维码已失效，请刷新”；重新创建会废弃原挑战。

确认码是本方案增加的明确确认步骤，用于降低误扫登录和二维码转发带来的风险，不能宣称可以消除所有社交工程。已关注用户无需取消关注再关注。

手机浏览器在同一页面提供二维码及原有手机/邮箱入口。相册识别或长按识别作为需要真机验收的辅助方式；单手机在网页和公众号之间切换、返回时恢复查询。不能承诺所有机型都能在同一屏幕直接扫自己的二维码，不把此能力作为手机唯一登录方式。移除现有微信内网页 OAuth 登录分支；未来若增加公众号菜单内便捷登录，另作小范围设计。

## 接口和挑战状态

以下均是拟实现的新接口，当前仓库尚不存在：

| 接口 | 用途 |
| --- | --- |
| `GET /api/auth/wechat/mp/bootstrap` | 获取登录前浏览器上下文和关联 CSRF token；不创建扫码二维码或用户，不以客户端传入的 Cookie 值建立上下文 |
| `POST /api/auth/wechat/mp/challenges` | 创建临时场景二维码，返回 challengeId、图片地址、expiresAt；绑定上下文 Cookie、服务端安全 next 和当前推荐来源 |
| `GET /api/auth/wechat/mp/challenges/:id` | 查询状态；只允许绑定浏览器访问，扫码后返回确认码；不返回 OpenID、UnionID 或登录 token |
| `POST /api/auth/wechat/mp/challenges/:id/complete` | 原浏览器消费已确认的挑战；已匹配账号建立会话并返回安全跳转路径，未匹配返回 NEEDS_ACCOUNT_RESOLUTION，不建号/发登录 Cookie |
| `DELETE /api/auth/wechat/mp/challenges/:id` | 关闭二维码时取消挑战 |
| `GET /api/auth/wechat/mp/events` | 微信服务器 URL 验证，按当前公众号协议验签后返回 echostr |
| `POST /api/auth/wechat/mp/events` | 接收经验证的关注、扫码、确认文本及取消关注事件 |

浏览器 API 使用项目统一 `{code,message,data}` 响应及中文错误，bootstrap、挑战状态、完成及身份处理响应均设置 `Cache-Control: no-store`，禁止 CDN/代理缓存；二维码 ticket、确认码和 CSRF token 不进入第三方遥测。微信服务器验证/消息回调按微信协议返回文本或 XML，直接处理响应，不能套 JSON 包装。`events` 与浏览器 API 分开鉴权，外部回调不要求浏览器 Cookie。

挑战采用 `WAITING → SCANNED → CONFIRMED → CONSUMED`，另有 `EXPIRED/CANCELLED` 终态。创建时生成密码学随机场景和至少 256 bit 的浏览器上下文随机值；二维码中的 scene、challengeId 和浏览器上下文是不同值，知道 scene 不能代替 Cookie。

- scene 使用新区分前缀，例如 `ABEI2_L_`，其随机部分与旧 `AI_..._AI` 分开。具体字符串长度及字符集上线前按当前公众号接口限制核验。
- 建议挑战和二维码有效期均为 180 秒，以服务端时钟为准；轮询约每 2 秒一次，离开页面暂停、返回恢复。Redis 状态变更不延长原始截止点。
- 浏览器上下文为 host-only、HttpOnly Cookie，生产使用 `__Host-abei_wechat_scan_context`、Secure、SameSite=Lax、Path=/，不设置 Domain；只接受服务端已发放且 Redis 中存在的上下文。HTTP 本地开发使用独立 Cookie 名，生产不接受该名。原上下文不能转成正式会话，完成后清理并由现有会话服务签发新令牌。
- 创建、完成、取消请求校验浏览器绑定、Origin/Fetch Metadata 和关联的 CSRF token；不能仅依赖 SameSite 或 CORS。针对登录前会话和 CSRF 的依据：[OWASP 登录 CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html#possible-csrf-vulnerabilities-in-login-forms)、[会话更新](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html#renew-the-session-id-after-any-privilege-level-change)。
- 一个浏览器上下文只保留一个有效挑战；刷新或另一个标签重新发起会使旧挑战失效，前端明确显示已失效，避免共享 Cookie 导致含混状态。
- 首次有效扫码以 Redis 原子操作绑定公众号 OpenID；另一个身份扫码不能覆盖。确认码在 SCANNED 时生成，只通过绑定浏览器查询返回，按该公众号 OpenID 的有效挑战范围保证无歧义；不同电脑同时登录同一微信时不能靠一个全局六位码猜测目标挑战。
- 确认文本仅从已验签解密的微信消息读取；要求同一公众号、同一 FromUserName、未过期挑战和正确确认码。建议每挑战最多 5 次错误尝试，并有按公众号身份的限额；文字中的确认码不允许作为 HTTP 登录参数使用。
- 完成时用原子检查同时验证绑定、截止点和 CONFIRMED 状态，并转为 CONSUMED，再执行身份解析。只有一个请求能成功领取；失败不重新启用挑战，显示重试并重新扫码。身份未匹配时只在服务端建立独立、同浏览器绑定的待处理上下文，建议有效期 5 分钟，以其完成下文账号选择/绑定；这是未登录状态，原挑战仍为已消费，不能再次使用。该上下文创建失败则重新扫码，不能恢复旧挑战。
- `startUserSession` 当前返回 access/refresh token 等内容，新完成接口只使用其 Cookie 副作用和必要用户信息，不能将完整返回值透传浏览器响应。
- 已登录浏览器不自动切换为另一账号；创建/完成前检查当前会话，登录期间被其他方式登录时也停止旧挑战。必要的公众号身份绑定属于本方案承接范围，通用解绑、账号切换和修改手机号不顺带实现。

## 公众号事件和密钥

推荐正式接管后使用公众号**安全模式**，以验证加密消息内容及接收 AppID，避免只验证查询参数却信任任意正文。上线前核验公众号当前模式和官方协议细节：

1. GET 验证检查 signature、timestamp、nonce；不能无条件回显 echostr。POST 校验 msg_signature，解密 Encrypt，校验消息内 AppID、接收公众号账号、内容格式和时间有效性，再处理事件。
2. 只接受 `MsgType=event` 且明确为 subscribe/SCAN 的有效登录 scene；subscribe 去除预期的 `qrscene_` 前缀，SCAN 使用原值，随后对新区分前缀及完整随机串严格匹配。普通关注、菜单、关键词或过期场景不能授予登录。
3. 身份来自已验证解密正文的 `FromUserName`；不以 URL 查询参数或浏览器上送 OpenID 为登录依据。重复事件按消息 ID或稳定事件组合键去重，状态更新和去重标志在同一原子处理内完成。
4. 确认消息为 text；按精确命令格式及上述身份/挑战范围处理。取消关注仅取消该身份尚未消费的登录挑战，不删除账户、作品或钱包，也不把关注状态变成持续访问所有已购权益的条件。
5. 回调尽快完成必要校验和 Redis 状态变更、生成被动回复，不创建用户、钱包或登录 Cookie。回复按当前安全模式加密封装；上游超时、Redis 故障和重复推送需要正确应答及失败重试策略。
6. 限定 XML 大小、禁止 DTD/外部实体、限制时间戳和字段长度。IP 来源校验只能作为补充，不能代替签名与 AppID 校验。回调限流避免让共享微信出口 IP触发普通用户/IP登录限额，使用协议校验及消息去重规则。

配置只保存在 API 服务的私有环境文件或密钥管理中：`WECHAT_APP_ID`、`WECHAT_APP_SECRET`、新增 `WECHAT_MP_CALLBACK_TOKEN`、`WECHAT_MP_ENCODING_AES_KEY`、`WECHAT_MP_ORIGINAL_ID`，以及公众号扫码登录功能开关。彻底删除网站应用登录凭据 `WECHAT_OPEN_APP_ID/WECHAT_OPEN_APP_SECRET` 在本登录模块、环境示例和部署传参中的使用；公众号登录与支付配置分别管理，不误删支付所需的公众号凭据。

access token 优先采用旧封装已经使用的 stable_token 思路，按微信返回 expires_in 缓存并提前少量刷新；多实例用共享缓存和刷新互斥，不主动 force_refresh，不因首次错误持续刷新。与旧站共用 AppID 时先核验所有 token 获取方式和共享策略，避免一个系统刷新令牌影响另一个调用方。不要为验证凭据调用生产 token/二维码接口，这些操作可能影响线上调用。

日志与 Nginx 访问日志只保留脱敏事件种类、状态和请求标识，屏蔽 AppSecret、access token、签名参数、二维码 ticket、确认码、OpenID/UnionID、Cookie 和完整 XML；错误不得返回源端凭据或消息正文。

微信当前接口权限、账号类型/认证状态、IP白名单、服务器地址、消息模式及回复行为必须在运营后台和当前官方资料核验。本次微信官方文档页面抓取不可用，以下只作为实施核验入口，未用于宣称当前账号已经具备权限：[场景二维码](https://developers.weixin.qq.com/doc/offiaccount/Account_Management/Generating_a_Parametric_QR_Code.html)、[事件推送](https://developers.weixin.qq.com/doc/offiaccount/Message_Management/Receiving_event_pushes.html)、[基础用户资料](https://developers.weixin.qq.com/doc/offiaccount/User_Management/Get_users_basic_information_UnionID.html)。用户头像/昵称及 UnionID 不作为扫码登录成功的必需返回字段，不假定关注事件会提供这些资料。

## 旧用户身份和数据库

旧扫码绑定的是 `User.openid`，小程序 `xcx_openid` 和其他渠道不是同一身份字段。新版已有 [User 模型](../packages/database/prisma/schema.prisma) 的可空 `wechatMpOpenId/wechatUnionId`，单公众号前提下不需要单独为临时挑战新增持久化扫码表；挑战和登录前状态放 abei 专属 Redis。

上线前结合 [数据导出方案](legacy-data-export-plan.md) 核验旧公众号 AppID，将旧 `openid` 迁入**同一 AppID** 对应的 `wechatMpOpenId`，保留来源 AppID及旧用户映射证据。先处理空值、重复 OpenID、导入身份冲突及禁用状态；在全部目标用户映射完成前，不启用新用户注册，以免旧用户被当成新用户。

账号匹配规则：

- 优先查当前公众号 OpenID，命中后复用原用户和钱包。UnionID 没有返回时允许登录，既有 UnionID 不被空值覆盖。
- 若有可靠获取的 UnionID，同时查询其所有者；与 OpenID 指向不同用户时停止并记录冲突，不自动合并用户、钱包和作品。返回 UnionID 与命中账号既存 UnionID 不同也拒绝，即使该新 UnionID 尚未绑定其他人，不得覆盖既存身份。
- OpenID 未绑定而 UnionID 已绑定时，只在来源平台上下文及账号绑定证据一致后回填；其他情况进入冲突/绑定流程。
- 未匹配的公众号 OpenID 可能对应未绑定微信的旧手机号账号，不能仅据此认定为新用户；返回 NEEDS_ACCOUNT_RESOLUTION。待处理上下文中的公众号身份来自刚刚验证过的回调，不接受前端补填。用户明确选择“绑定已有账号”或“创建新账号”，不能把默认选项当作同意创建。这是普通账号绑定/注册流程，不是网站微信登录的过渡兼容。
- “绑定已有账号”先用已有可验证手机号/邮箱完成身份验证，再把待处理公众号身份绑定到已证明所有权的用户；已有身份占用、UnionID冲突或账号禁用均拒绝。绑定写入需事务及唯一约束，不合并钱包、作品或重发奖励。
- “创建新账号”需明确提示“已有账号请先绑定，新账号不会带入原有资产”，并先完成手机号验证。手机号已属于某账号时转到上述经验证的绑定流程，不新建第二个用户；手机号无主且身份仍未占用时才创建零余额钱包及用户。内部唯一邮箱按 AppID/OpenID 服务端摘要生成，默认 nickname“微信用户”、头像为空、随机不可用密码且 `passwordLoginEnabled=false`，不得将内部邮箱作为通知/找回目标。未完成手机号验证或选择步骤不创建用户，也不发登录 Cookie。
- 推荐来源仅保存在发起浏览器的服务端挑战内；旧用户登录不触发首次注册奖励，真正首次创建继续复用现有幂等事务，不复刻旧版赠送或订单 signal。

若采用多公众号或变更 AppID，现有单一 OpenID 列不足以保留多应用身份，应增加 `(provider, appId, openId)` 唯一的身份映射及来源审计，属于后续 migration。旧数据映射表按前一数据迁移方案单独实现；本次不改 schema，也不把真实身份数据写入 seed。

当前绑定/注册验证失败关闭待处理上下文，要求重新扫码；过期、已绑定或已创建后不可重用。绑定、建号和重试并发保证只有一种终结操作成功，手机号认证的证明必须短期、单次并绑定同一上下文/用途。

## 测试和正式接管

公众号消息接收应规划一个统一接收入口，不能假定旧站和新版能各自配置一份独立回调地址而同时收到完整事件。

**推荐顺序**：在已有独立测试公众号上验证新流程；对旧生产公众号做配置盘点但不调用写接口；旧用户身份导入和回归验收完成后，在另一项明确授权的发布任务中接管消息入口，再开启新版按钮。若没有独立测试公众号，只做 mock/协议夹具验收，生产联调要明确批准后进行，不能用“只读检查”名义创建生产二维码或更新公众号配置。

若必须双站并行，要先建立经过授权的统一消息分发器：新前缀送新扫码处理器，旧 scene 和其他业务按已有规则处理，token 管理也需协调。这属于额外范围，不能为了本次替换直接修改旧站。安全模式和旧明文回调不兼容，不能把密文原样转发到旧 `mp_message`；解密事件内部转发需要有专门适配及服务间认证，不能假装原始微信签名仍能认证改写后的正文。

接管前列出全部已有关注回复、关键词、菜单、支付/业务消息使用方及运行模式，决定承接或路由，不只是保留登录 scene。回退需要同时回退接收地址、消息模式/密钥和新功能开关；不能切回旧地址却留下旧代码无法解密的新模式。微信支付 OAuth及通知地址分别核验，不与消息入口混为一项配置。

## 实现范围和验收

实现范围：`apps/api-core/src/auth`、必要的 API XML入口/限流/日志规则、`apps/web` 登录组件及微信 helper、相应测试、abei 专属部署配置和空值环境示例。旧源码/旧生产库、上游 xueleai发布脚本、支付业务和其回调不修改；无需新增 migration 或 seed。

需要实现并测试的核心内容：

1. 公众号二维码及共享 token 客户端，配置完整性；代码和配置不再依赖网站应用登录，旧 OAuth 登录及过渡接口均不存在，超时/错误不泄露密钥。
2. 微信加密事件校验、XML防护、场景规范化、普通关注忽略、重复/乱序/过期事件、另一微信身份扫码不能覆盖。
3. 浏览器 Cookie及CSRF绑定，确认码、TTL、原子状态、并发消费；知道二维码 scene/OpenID 而没有浏览器绑定不能登录。
4. 原浏览器才写会话 Cookie；complete 丢失响应/中途失败不恢复已消费挑战、不得重复创建用户/钱包/奖励或透传 token。
5. 无 UnionID 的旧公众号用户正常回到原账号；来源 AppID变更、身份冲突、禁用用户、旧用户误新建；未绑定微信的旧手机号账号可通过验证绑定，用户选择及手机号验证不能被跳过。
6. QR面板的扫码/确认/过期/关闭/刷新状态，多标签互斥、手机返回恢复、手机号/邮箱登录、身份选择及微信支付回归。

后续实现使用完整 TDD 和独立审查；单元测试先使用 mock 微信客户端/Redis及数据库夹具。新增测试文件完成后运行针对性微信测试，再执行 API/Web typecheck，涉及页面/入口及部署的修改运行对应 lint/build，发布前执行必要完整回归。本次文档验收仅运行链接/证据/敏感值检查和 `git diff --check`。

现有 package 测试/开发脚本仍有上游 332x 和 xueleai 默认值，不能原样用于 abei 验收。未来测试必须显式使用 abei 专属测试数据库/Redis，或完全 mock；新增本地服务遵循 3600 HTTP、3601 Web、3602 API、3605 Redis，不连接/复用 xueleai资源。生产微信回调需独立核验的公网 HTTPS入口，不能将本机 localhost 地址配置给公众号。

最终真机验收必须覆盖：未关注用户扫码关注并回复确认码、已关注用户扫码确认、旧用户仍能查看原作品/权益、同二维码第二次不能领取登录、另一个浏览器不能查询/消费、同微信多电脑不串挑战、手机备选入口可用，以及既有消息业务与微信支付持续正常。

在批准接管前要确认：使用旧版同一公众号 AppID及其接口权限，旧身份映射完成，现有回调使用方/模式盘点完成，统一 token 策略，公众号“回复确认码”及新用户手机号验证交互通过真机验收，以及接管/回退安排。当前本地 `.env` 没有配置 WECHAT登录项，不能据此推断生产配置或宣称已经可用。

## 实现补充

- 绑定已有邮箱账号使用原邮箱和密码，原子比较验证时的邮箱、密码哈希、密码登录开关及微信身份。手机号绑定原子比较已验证手机号。四类普通登录和扫码登录共享已有浏览器上下文的占用状态；领取后不允许取消或刷新，普通表单提交时禁止启动微信登录。
- 微信绑定只接受服务端生成并哈希记录的标准短信 `ALIYUN_SMS`。现有 DYPNS 校验不能绑定具体发送记录，在本流程中拒绝，普通手机登录保持原有支持。
- 默认关闭登录和新用户注册开关，不需要 schema migration 或 seed。真实消息接管、权限和手机操作仍为发布前要求。
