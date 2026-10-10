# 《我想成为》职业启蒙绘本

2026-10-10 在本地 abei 完成《我想成为》十六本系列。新增十三本通过既有“乐乐绘本工作室”账号投稿、审核发布，同一个资源现包含十六种职业。

前台地址：[我想成为](http://127.0.0.1:3600/c/e2edf14f892a944946c00c80)。资源中心 `/center` 使用正式发布数据；阅读遵循现有登录与学习者访问流程。

| 绘本 | 孩子的理想与陪同家长 | 场景与职业人物 | 主题 |
| --- | --- | --- | --- |
| 我想成为医生 | 小安，妈妈陪同 | 中国城市社区卫生服务中心，林医生 | 细心、倾听、关心与合作 |
| 我想成为消防员 | 小宇，爸爸陪同 | 中国城市消防站开放日，刘叔叔 | 训练、团队配合与安全意识 |
| 我想成为老师 | 朵朵，爸爸妈妈一起参与 | 中国城市幼儿园，陈老师 | 陪伴、鼓励、探索与情绪支持 |
| 我想成为护士 | 甜甜，妈妈陪同 | 城市医院开放日，男护士林护士、周奶奶 | 耐心、倾听与关心 |
| 我想成为警察 | 晨晨，爸爸陪同 | 社区交通安全活动，女交通警察陈警官、王奶奶 | 规则、等待与帮助他人 |
| 我想成为厨师 | 糖糖，爸爸妈妈一起参与 | 社区餐厅开放日，何厨师 | 分工、食物搭配与珍惜劳动 |
| 我想成为公交车司机 | 航航，妈妈陪同 | 城市公交开放日与乘车，女司机赵司机、刘爷爷 | 专心、文明乘车与安全 |
| 我想成为地铁司机 | 可可，爸爸陪同 | 地铁交通开放日、公开体验模拟器，陈叔叔、马阿姨 | 专注、耐心与团队合作 |
| 我想成为快递员 | 东东，爸爸妈妈一起参与 | 社区快递服务站、智能柜，刘姐姐、张奶奶 | 细心、守信与城市服务 |
| 我想成为环卫工人 | 琪琪，妈妈陪同 | 公园环保参观，王阿姨、赵叔叔 | 尊重劳动、分类与日常责任 |
| 我想成为建筑师 | 星星，爸爸陪同 | 城市建筑展示中心与开放工作室，林叔叔、周阿姨 | 观察、倾听与合作设计 |
| 我想成为工程师 | 佳佳，爸爸妈妈一起参与 | 城市建设科普展厅，女工程师陈工程师、黄师傅 | 安全建设、合作与耐心 |
| 我想成为科学家 | 豆豆，妈妈陪同 | 科普馆开放实验室，周科学家 | 提问、比较、观察与记录 |
| 我想成为飞行员 | 悦悦，爸爸陪同 | 机场航空教育区、固定地面训练模拟器，许机长、唐副驾驶 | 检查、团队与安全责任 |
| 我想成为园艺师 | 林林，爸爸妈妈一起参与 | 城市公园，梁园艺师 | 观察生长、耐心与照料 |
| 我想成为兽医 | 诺诺，妈妈陪同 | 城市宠物诊所，赵兽医、团团、点点 | 温柔、尊重与关爱动物 |

十六本各有 16 页正文，另加 1 张带中文书名的封面；每本播放器共 17 个画面。每本由一个不同的五岁孩子表达自己的职业理想，独立成篇，面向幼儿园。对话采用中文双引号“”。

新增十三本固定孩子、陪同家长、职业人物及反复出现的配角。逐页 `pageCast` 只引用本书人物表，专业人物不会出现在家庭段落。快递篇的刘姐姐与原老师篇的保育老师刘阿姨是不同人物。宠物诊所中的团团固定为奶油金色垂耳犬、白胸、红项圈与蓝牵引绳，点点固定为灰白猫、紫项圈与浅蓝猫包；家庭职业游戏使用另一只带蓝蝴蝶结、可见缝线的浅棕毛绒狗。

## 视觉与素材

参考用户提供的职业绘本图片：明亮蓝、黄、红配色，圆润人物、豆豆眼、红脸颊、柔和立体感。使用新创作的中国人物和城市场景，封面采用统一的深蓝圆体字和白色描边。

- 生成方法：内置 `image_gen.imagegen`，先制作三本封面，再以各自封面作为人物与画风参考逐页独立生成。生成图片保留在原生成目录，选定图片复制并压缩到项目。
- 本地素材目录：`apps/web/public/picture-book-demos/careers/`。`doctor/`、`firefighter/`、`teacher/` 的选定封面和 16 张正文图，均为 WebP 960×1280，严格 3:4，质量 88；`series-cover-v2.webp` 为 1600×900 的系列资源封面。保留旧版及中间修订图用于来源追溯，实际选择以清单中的 `assetName` 为准。
- `scripts/picture-books/career-series-data.mjs`：完整中文文稿、角色与分镜；`career-cast.mjs`：每本孩子、家长和逐页配角；`career-generation-manifest.json`：52张选定素材的提示词、参考图、原始路径及版本。
- 人物修订选定 36 张新图：消防员与老师的封面和全部 16 页，医生第 15 页母亲发型修正，以及三个孩子的系列封面。消防员第 3、10 页为 `-v3.webp`，老师第 14 页为 `14-v3.webp`，其余本次修订采用 `-v2.webp`。`career-identity-generation-manifest.json` 保留完整编辑记录（包括保育老师第14页的中间稿）和视觉核对结果。
- `career-publication-manifest.json`：当前52张已上传素材的 ID、公开 URL、尺寸、字节数、SHA-256，以及正式资源和修订审核 ID；`career-publication-v1-manifest.json` 为首发历史清单。

人物连续性：小安穿黄色短袖与青蓝色背带裤，小宇穿翠绿短袖与深蓝短裤，朵朵穿淡紫色白领裙并戴黄色星形发夹。三位家长组合各自固定外形。陈老师、米米、浩浩同时出现于老师篇和消防员第15页，沿用同一人物设定；保育老师刘阿姨的午餐与备课场景采用同一低盘发、浅桃色白领短袖工作服。逐页提示词只加入实际出场角色，避免将封面职业人物带入家庭场景。

插画场景依据中国现有社区健康服务、消防站参观和幼儿园活动安排：社区儿童保健参照[国家卫生健康委基层卫生服务通知](https://www.nhc.gov.cn/jws/c100073/202606/20c3486dc9ba4c09a9747547d4e841ad.shtml)及[儿童健康管理服务规范](https://www.nhc.gov.cn/cms-search/downFiles/cbf5c9f643d240ac9ec1b6a4f4bcbe6a.pdf)；消防站参观参考[应急管理部消防开放活动](https://www.mem.gov.cn/xw/jyll/202306/t20230601_452416.shtml)，报警情境参照[119 消防安全知识](https://www.mem.gov.cn/kp/shaq/201904/t20190401_366005.shtml)；幼儿园篇以游戏和一日生活为主，参照[教育部幼儿园保育教育质量评估指南](https://www.moe.gov.cn/srcsite/A06/s3327/202202/t20220214_599198.html)。儿童在专业场景中由成人陪伴参观，家庭和幼儿园中的职业扮演使用玩具。

新增职业采用中国城市常见设施与活动场景：蓝白城市公交、地铁站屏蔽门与黄线、快递服务站与智能柜、社区餐厅、公园分类桶、建设科普展厅和宠物诊所。公开交通体验参考[北京市交通委交通开放日与模拟体验](https://jtw.beijing.gov.cn/xxgk/xwfbh/202309/t20230922_3264723.html)；公园环保活动参考[郑州市园林局亲子环保活动](https://ylj.zhengzhou.gov.cn/ylzx/10111845.jhtml)；科普馆场景参考[北京科普基地活动与实验空间](https://kw.beijing.gov.cn/ztzl/rdzt/kpbj/kpjd/202401/t20240105_3799046.html)。这些材料用于场景依据，书中人物与故事为原创虚构。

## 十六本扩展清单

- `career-expansion-a.mjs`、`career-expansion-b.mjs`、`career-expansion-c.mjs` 保存十三本新增文稿、完整人物外形、家长组合和逐页出场名单；`career-expansion-data.mjs` 汇总原三本与新增十三本。原 `career-series-data.mjs` 仍只包含原三本，防止旧发布脚本意外扩大范围。
- 图片由内置 `image_gen.imagegen` 逐页独立生成；`career-expansion-{a,b,c}-generation.json` 与 `career-expansion-gardener-generation.json` 保存提示词、参考图、原始 PNG 与选定 WebP 文件。`career-sixteen-generation-manifest.json` 汇总全部选定素材，`assetName` 是实际采用的版本。
- 完整系列有 16 张书名封面、256 张正文插画、1 张系列资源封面，共 273 张选定素材。每本图片 960×1280，资源封面 `series-cover-v3.webp` 为 1600×900，副标题为“职业启蒙绘本 · 16种职业”。`career-sixteen-series-cover.json` 保存该封面编辑记录。
- 新增十三本的正式作品 ID 为 `abei-career-` 加 `nurse`、`police`、`chef`、`bus-driver`、`subway-driver`、`courier`、`sanitation-worker`、`architect`、`engineer`、`scientist`、`pilot`、`gardener`、`veterinarian`。每本有封面与 16 页正文，不为不同职业复制小安。

`expand-career-series.mjs` 针对同一个资源扩展，不新建第二个系列。`career-expansion-baseline.json` 冻结人物修订后的原三本文稿和原系列目录；任何人工编辑、错误归属、独立待审材料或拒绝状态都会中止。

`prepare` 只上传并以 R2 签名读取核验图片 SHA-256，不创建原稿或资源草稿。`publish` 创建十三本新原稿，然后复用现有 `saveCourse`、`submitCourse`、`approve` 更新同一系列。保存、提审、批准分别在各自业务事务内持课程行锁、材料 advisory 锁、源书和 publication 行锁，重新校验完整原稿、当前快照、批准快照及最新独立材料变更状态；批准时再次绑定审核请求、工作版本与有效管理员。不会因旧课件已有 `approvedHash` 而跳过本次复核。恢复时复用同一目标版本、素材和审核日志。

本次不修改原三本源稿、密码、钱包、乐乐十二本、其156段配音、原乐乐资源及公开快照。`career-sixteen-publication-manifest.json` 是十六本扩展后的发布与素材清单，原三本的 `career-publication-manifest.json` 保留为人物修订后的历史基线。

十六本扩展正式审核 ID：`cmv1rrh1g000x36mzkcqm6rk7`。十三本新课件的首次公开与系列新版本在这次课程审核中批准，并有一条对应管理员操作日志。`career-sixteen-verification.json` 保存每本主角、家长组合、普通读者可读画面数、批准快照哈希和恢复状态。

整本视觉拼图保留在本机原生成目录的 `career-sixteen-qa/` 下，避免将检查用多页拼图作为前台素材；各生成清单的 `checks.contactSheet` 指向保存后的路径。所有选定原 PNG 保留，项目中仅存放单页 WebP 和必要修订版本。内置生成提示词与素材选择见 [完整清单](/Users/ericword/abei/scripts/picture-books/career-sixteen-generation-manifest.json)。

## 数据与发布

允许修改范围为本系列文稿、素材、导入脚本及本文档；复用现有 PictureBook、MediaAsset、Course 与课程审核服务。无需数据库 schema、migration 或通用 seed 变更。

作者：`abei-lele-studio`。正式作品 ID：`abei-career-doctor`、`abei-career-firefighter`、`abei-career-teacher`。系列资源 ID：`e2edf14f892a944946c00c80`，保持原地址。首发审核记录为 `cmv1a7yvw0000i2mxayyb1323`。

2026-10-10 人物修订通过三条正式课件变更审核：医生 `cmv1njhsz0000wsmz60dmtxb3`，消防员 `cmv1njhub0002wsmze7uewnug`，老师 `cmv1njhv10004wsmzzchksgm8`；系列新版本审核为 `cmv1njhwz000dwsmzasoy4irx`。四条审核各有一条管理员操作日志。

`revise-career-series.mjs` 用于本次已发布系列修订。`career-v1-baseline.json` 冻结首发原稿及资源信息；仅允许完整原稿或本次完整目标稿，任何人工编辑或拒绝状态都会停止执行。`prepare` 只上传并核验素材与目标范围，`publish` 使用版本 CAS 替换三本原稿，通过现有 `recordMaterialChange`、`approve` 更新课件；随后使用现有 `saveCourse`、`submitCourse`、`approve` 更新系列版本。保存前的行锁复核和业务保存共享事务，防止上传期间出现的人工草稿被覆盖。重跑时复用目标版本和审核日志。

`publish-career-series.mjs` 使用现有上传、资源创建、投稿与审核服务，素材进入已配置的 abei R2 存储；每次上传或恢复均读取存储对象并核验本地 SHA-256。`prepare` 只完成素材、正式作品和资源草稿，`publish` 再提审并批准。批准前核对资源目录与三本原稿的固定快照，检测重复图片、人工修改、错误归属和重复运行。已发布资源不会重复创建或重复审核；被拒绝的投稿不能自动重审。恢复清单可使用已保存的发布清单，不含环境配置或密钥。

仅对 abei 数据库执行；不修改工作室密码、钱包及原《熊猫乐乐的森林朋友》系列。本次核对作者认证字段、钱包、12 本原绘本和原系列的摘要，均与导入前一致。

## 验证

本次扩展的代码与测试记录：

- `node --test scripts/picture-books/career-expansion.test.mjs scripts/picture-books/career-import.test.mjs scripts/picture-books/career-revision.test.mjs`：16/16 通过。覆盖十六本目录、不同孩子、逐页人物绑定、完整记录、人工修改、拒绝、独立待审与保存/提审/批准事务中的复核。
- `node --check scripts/picture-books/expand-career-series.mjs`：通过。独立代码复查发现并关闭已有课件可能在提审到批准之间发生状态或快照变化的窗口，复查通过。
- 审核与绘本四个相关 API 测试文件：37 项通过，1 项数据库专用测试按默认条件跳过。使用不可达 abei 测试占位端口3609，并显式设置 Redis 占位地址，不连接其他项目服务。
- 全量测试未全部通过：AI Gateway 50 项、Web 598 项通过；数据库测试 151 项通过、2 项失败，这两项旧测试只允许3604测试地址，拒绝本次独立3608测试库；单独 API 全量测试 1257 项通过、25 项失败、6 项跳过。API 失败涉及现有 AI 历史列表、语音与钱包、旧日志、认证、R2 地址及集成环境测试，未修改这些模块。本次不将全量结果报告为通过。
- 全量数据库测试只在独立临时 `abei-career-test-db` 的3608端口执行迁移；该测试容器已经删除。业务数据库未执行 migration 或 reset。
- 实际发布与普通读者验证：16 本 COMPLETED、16 个 APPROVED 公开快照；每本封面与16页正文均可读取，3:4，全部页码、配文及图片 URL 与选定原稿一致。273 张选定素材在 prepare/publish 时通过 R2 签名读取和 SHA-256 核验；仍只有1个同名系列，新版本审核日志只有1条，已发布恢复状态为 PUBLISHED。
- 前台浏览器显示同一个系列的全部16个目录条目与“16种职业”封面；从目录进入新增兽医篇，确认封面、第1页和第16页、人物及中文双引号配文。截图：[系列目录](/Users/ericword/.codex/visualizations/2026/10/07/01a115a8-a071-78f2-b741-2ab38b1fae2a/career-sixteen-series-published.png)、[兽医首篇](/Users/ericword/.codex/visualizations/2026/10/07/01a115a8-a071-78f2-b741-2ab38b1fae2a/career-veterinarian-first-page.png)、[兽医结尾](/Users/ericword/.codex/visualizations/2026/10/07/01a115a8-a071-78f2-b741-2ab38b1fae2a/career-veterinarian-last-page.png)。
- 导入前后摘要比对通过：原三本源稿与已批准快照、工作室认证字段和钱包、原乐乐12本与156段配音、乐乐系列版本和公开快照保持一致。

下列记录属于首批三本的人物修订：

- `node --test scripts/picture-books/career-import.test.mjs scripts/picture-books/career-revision.test.mjs`：10/10 通过，覆盖人物家长组合、逐页配角、缺页、错误归属、人工修改、拒绝恢复、审核绑定及保存时并发草稿保护。
- `node --check scripts/picture-books/revise-career-series.mjs`：通过。独立代码审查已复核修订与批准范围。
- `DATABASE_URL='postgresql://test:test@127.0.0.1:3609/abei?schema=public' pnpm --filter @xueleai/api-core exec node --import tsx --test --test-concurrency=1 tests/course-review-service.test.ts tests/picture-book-playback.test.ts tests/picture-book-r2-image.test.ts tests/picture-book-image.test.ts`：37 项通过，1 项数据库专用集成测试按默认条件跳过。第一次本机启动因缺少 `DATABASE_URL` 未进入审核测试，补上不可达测试占位地址后通过。
- 本地真实业务验证：3 本 COMPLETED、16 页正文加封面、3:4；3 个 APPROVED 课件快照与新文稿和人物一致；普通非作者账号读取每本17个新画面；仍只有1个系列，本次新增4条审核及4条对应日志；52张选定素材在上传/发布时通过R2签名读取与SHA-256核对；已发布状态的恢复检查通过。
- 浏览器确认新系列简介与三孩子封面、小宇和爸爸的第1页、朵朵和爸爸妈妈的入园及家庭页，配文与图片一致。账号认证字段、钱包、原乐乐12本及156段配音、原系列版本与公开快照的摘要保持不变。

本次没有前端代码、路由、依赖或构建配置变更，未运行全量 lint、typecheck、build、install 或 migration；采用与文稿导入和既有发布流程直接相关的测试及真实环境验真。没有执行 GitHub 推送或生产部署。
