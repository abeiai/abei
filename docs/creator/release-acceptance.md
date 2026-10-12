# 阿贝绘本创作助手：发布与验收

版本：0.1.0。代码与安装包已制作，GitHub Release、服务器部署及真实客户端端到端验收尚未完成。不得把下表的格式/安装检查称作完整可用保证。

| 入口 | 已验证 | 未验证 / 限制 |
| --- | --- | --- |
| Codex | 0.150.1 命令行临时安装/列出插件；临时安装已移除 | 最终修复包的再次安装、OAuth、完整创作/同步 |
| Claude Code | 原生插件文件已生成 | 本机 CLI 缺失；安装、OAuth、素材同步 |
| Claude Desktop | MCPB 官方校验与客户端包信息预览 | 设备策略禁用扩展安装；未安装或运行 |
| Claude Cowork | 独立云端插件包已生成 | 导入、OAuth、云端文件访问与安全传输 |
| 豆包工作电脑版 | 技能和说明包已生成 | 未获得对应客户端入口；普通豆包不计作验证 |
| WorkBuddy | 远程配置格式及本地 TGZ 配置生成 | 原生编辑入口未打开；没有安装或授权 |
| DeepSeek Harness | 0.2.0-rc.2 临时安装/启用检查后移除 | 最终修复包再次加载、设备授权、完整创作 |
| 独立助手 | macOS ARM64 运行与 MCP；Linux ARM64 容器基础执行 | 其他平台实机、Windows ACL、签名/公证 |

下载 URL 固定为 `https://github.com/abeiai/abei-creator/releases/download/v0.1.0/<文件名>`。真实文件清单及哈希在 `integrations/abei-creator/release/SHA256SUMS`。共 14 个包/程序，加一个校验文件；公开仓库与 Release 当前待发布。升级前停止旧助手，保留外部作品标识和各配置的私有状态目录。不得修改用户全局客户端配置来“证明”安装完成。

## 网页与权限验收

| 页面/接口 | 验收内容 |
| --- | --- |
| `/creator` | 七个具体入口分属五类客户端；安装、连接、同步、主动提交说明；下载状态诚实 |
| `/creator/authorize?transaction=…` | 主账号、第三方客户端名、权限；同意与拒绝；失效和未登录提示 |
| `/creator/device` | 可键盘输入设备码；登录延续；同意/拒绝后返回客户端 |
| `/account/connections` | 客户端名称、权限、授权/到期/最近使用时间、尚未使用、撤销 |
| `/storybook`、`/storybook?book=<id>` | 本人的全部既有作品范围不变；外部同步来源与当前内容版本、审核反馈 |
| `/picture-books/<id>/play` | 登录主账号可读私有草稿；他人无权访问草稿素材 |
| `/dashboard/courses`、`/dashboard/courses/<id>` | 外部同步专辑标识/版本、审查反馈；既有课程仍可用 |
| `/c/<id>` | 作者查看工作版本；游客仅已公开快照；专辑固定成员版本 |
| 管理后台绘本/课程审核 | 私有待审快照、通过/拒绝原因；重新提交不替换旧公开快照 |

最近使用表示成功通过客户端身份和范围校验的时间，最多每五分钟持久化一次；无效、过期、撤销或权限不足的请求不产生使用记录。真实所属客户端软件未在作品模型持久化，因此仅显示“外部客户端同步”，不虚构应用名或插件版本。

## 本地隔离检查

仅在无真实 `.env*` 的独立工作树中运行。先提供明确的 `DATABASE_URL`（本地3668、库名abei_creator_clean）、`REDIS_URL`（本地3669）、`NODE_ENV=test` 以及测试密钥。`PYTHON_BIN` 可指向符合项目 requirements 的独立 Python 环境。不得读取/覆盖用户根工作区真实环境。

```
node scripts/release/abei-verify.mjs --preflight-only
node scripts/release/abei-verify.mjs
```

全量入口直接调用数据库/API/Web 测试，不经过会读取根 `.env` 的旧 API test wrapper。归档保留站点有意维护的 public/yinbiao/generated 图片，仅排除 packages/database/generated 的生成代码。默认保留可选集成测试的开关；若启用推荐注册 HTTP 测试，需单独启动3665隔离 API 并显式设置 `ABEI_TEST_API_BASE_URL=http://127.0.0.1:3665/api`。普通测试监听默认3664，可用 `ABEI_TEST_HTTP_PORT` 指定3600–3680内非数据库端口，不终止其他程序。

## 发布顺序

1. 控制端完成完整测试、最终独立审查和新迁移演练。确认 `git ls-remote origin refs/heads/main` 等于本次完整 SHA。公开源码仓库/Release 发布后逐个检查全部真实安装包和校验文件。只有这一步可以称为 GitHub 已发布。
2. 修复 `mcp.abeiai.com` 的 DNS/CDN 源站配置，指向阿贝源站；通过正常 ACME 取得专用证书。证书路径为 `/etc/letsencrypt/live/mcp.abeiai.com/`。不得关闭 TLS 校验。部署脚本会在证书缺失、过期临近或主机不匹配时，在改变维护状态前终止。
3. 从完整提交生成不可变代码包：`python3 scripts/release/abei-archive.py pack <40位SHA> <私有暂存目录>/abei.tar`。同步包、脚本及包的 SHA256，通过独立私有通道送到服务器。不得使用旧 xueleai 发布脚本。
4. 在服务器 `/opt/abei` 非 Git 目录执行 `bash <脚本目录>/abei-server-release.sh <40位SHA> <私有包路径>`。脚本使用 `abei-prod` 和 `docker-compose.abei-prod.yml`，先校验证书与新 Nginx 配置并构建镜像，保存旧镜像标签/配置；启用维护后停止旧 API，随后备份数据库，替换代码、迁移并启动新进程。禁止旧 API 在快照回填与切换窗口继续写入。
5. 脚本不执行 seed/reset，不删除数据卷，不复制真实 env。保留 `.env.production`、`deploy/data/`、`deploy/certs/`、uploads/logs/旧私有素材卷；新增 `abei-prod_creator_assets` 仅挂载 API。Issuer `https://mcp.abeiai.com` 与两个 audience 在协议源文件中固定，主站通过 `CREATOR_MAIN_ORIGIN` 显式设置。公网仍只有80/443进入3600/3610。
6. 新 API 与 Web 的运行版本需匹配发布 SHA；API 三项健康、Web 创作助手页面和 AI Gateway 均就绪后，强制重建 Nginx 入口，更新 bind mount 与上游地址。在维护仍开启时，用一次性 API 镜像共享入口网络命名空间，从127.0.0.1正常校验 TLS 并检查主站页面、MCP 元数据/鉴权/私有路径；只有这些检查通过后才解除维护。维护仅放行入口容器自身127.0.0.1，公网与伪造转发头无法绕过。控制端继续运行 `node scripts/release/abei-verify-live.mjs --artifacts`，再按网页矩阵完成真实浏览器和客户端验收。脚本输出服务器切换不等于完整线上发布成功。

## 回滚与中断

失败时默认保留维护模式。私有备份位于 `/opt/abei/deploy/data/backups/creator-<UTC时间>/`，包含数据库 dump、原 Compose/Nginx/发布 SHA和旧镜像 ID；旧镜像另存 `abei-<服务>:rollback-<时间>` 标签。不要清理这些镜像或任何数据卷。

新增 schema 为向前兼容的添加；但是旧 API 不维护新的公开快照字段，不能直接把旧程序放回并恢复写入。优先前向修复；必须回滚时，由控制端在维护模式下核对迁移后是否有新增业务写入，再决定恢复私有数据库备份并启动旧镜像/配置，验证数据与页面后才解除维护。不能自动覆盖有新写入的生产数据。本脚本没有自动数据库恢复或证书签发，也没有执行真实服务器部署。
