# 会员收费 Implementation Plan

**Goal:** 保留点数包，完成多周期会员收费、周期点数和权益闭环。
**Architecture:** 会员等级独立配置；订单存快照；每个已付周期有独立余额；共享个人点数事务函数处理来源分配。
**Tech Stack:** Next.js、NestJS、Prisma、PostgreSQL。
**Spec:** docs/superpowers/specs/2026-09-12-membership-design.md

## 约束与决定

用户已确认季付年付一次性发点、完整周期结束清零；其余周期采用同一规则。续费及换等级顺延生效，不中途退款。保留现有未提交工作，不加入本次提交。只修改 web、api-core、database 及 docs；不发布。

## 执行清单

- [x] 1. 数据与纯规则：新增 MembershipPlan、MembershipPeriod、MembershipCreditAllocation；订单会员快照；先测试定价、月底闰年、点数分配，再实现；新增 migration 只包含会员差异。
- [x] 2. 后台 API 与支付：新增 membership 模块和管理接口；支付接收 membership:<planId>:<period> 商品编码，存快照、串行排期、幂等开通；测试非法价格、重复支付和当前周期不受后台编辑影响。
- [x] 3. 页面：/admin/memberships 管理等级、五种周期、折扣、手动价、赠点、存储、学习者与扩展权益；/pricing 展示会员和购买入口；/dashboard/billing 展示周期余额；复用支付弹窗。
- [x] 4. 账务：共享 reserve/settle/consume 函数先测试会员优先、跨来源退回、过期与重试；替换 AI、audio、video-guide、english-guided-study、wallet 字帖个人扣点；购买余额单独保留。
- [x] 5. 权益：服务端场景最低等级/提前开放校验，后台编辑门槛；学习者新增和恢复检查额度；公开资源权益预留会员豁免，不新增收费。
- [x] 6. 验证：针对性测试、数据库事务集成测试、Prisma 校验、pnpm lint/typecheck/test/build、浏览器页面验收、独立审查后修复。记录未完成检查的具体原因。

## 接口契约

MembershipPlan: id/name/rank/isEnabled/storageGb/learnerLimit/benefits(JSON数组编码名称值)/prices(JSON数组)。价格项 period(DAY/WEEK/MONTH/QUARTER/YEAR)、originalPriceCny、discountPercent(实付百分比)、salePriceCny(可空，手动优先)、credits、isEnabled；API 输出 amountCny、pricePer100Credits。

GET /membership/plans 公开等级；GET /membership/me 当前会员及待生效周期；GET/POST /admin/memberships、PUT /admin/memberships/:id；GET/PUT /admin/memberships/settings 配置非会员学习者额度。POST /payment/orders 保持 packageCode 字段，会员采用 membership:<planId>:<period> 编码。

会员有效期判断始终用 startsAt <= now < endsAt。MembershipPeriod 保存 planId/name/rank/storageGb/learnerLimit/benefits/credits/remainingCredits/orderId/startsAt/endsAt 快照。MembershipCreditAllocation 保存 operationKey(全局唯一)、userId、periodId、membershipCredits、purchasedCredits、settled。

## 验证记录

- 本地 `3324/xueleai` 执行 `pnpm db:migrate:deploy`，仅应用会员 migration，无数据重置。
- 定价、月末闰年、点数来源及跨周期失效、场景权限回归通过。真实 PostgreSQL 会员支付/扣点并发测试通过，所有唯一测试数据清理。
- 浏览器验证 `/admin/memberships` 未登录跳转、临时管理员登录、等级保存、五周期输入、100元八折80元、手动75元覆盖，以及 `/pricing` 季付每百点7.50元显示。临时等级和管理员已删除。
- 独立审查四项发现均修复并复核：子场景门槛、失效流水、未访问周期补赠点流水、顺延生效日期。
- 全量验证发现既有打字测试两个单元的排序都为0、断言却假定固定先后；仅为第二单元测试数据设置sortOrder=1，未修改打字业务。这一行留在用户原有未提交测试改动中，不吸收进会员提交。
- Web 459项和database126项全量测试通过；完整build、全量lint/typecheck通过，最后相关代码变化已再次类型检查。API全量修复旧fixture缺失后最终957项通过、0失败、2项条件跳过；会员真实数据库集成已通过单独显式运行。
- 未执行pnpm install：未增加依赖。未执行seed：真实会员等级和价格由管理员配置。未执行线上部署或推送。

## 本地提交

- `3c5adf2b`：会员数据、支付、周期点数、场景和学习者权益及测试。
- `dbd4b568`：会员后台、价格选择、会员账单及前台测试。
- 工作区原有未提交的词典、打字、英语导学等改动保持未提交；混合文件仅提交会员相关修改块。
