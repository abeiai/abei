# 《我想成为》职业启蒙绘本

2026-10-10 在本地 abei 完成首批三本，通过既有“乐乐绘本工作室”账号制作并作为一个系列资源投稿、审核发布。

前台地址：[我想成为](http://127.0.0.1:3600/c/e2edf14f892a944946c00c80)。资源中心 `/center` 使用正式发布数据；阅读遵循现有登录与学习者访问流程。

| 绘本 | 孩子的理想与陪同家长 | 场景与职业人物 | 主题 |
| --- | --- | --- | --- |
| 我想成为医生 | 小安，妈妈陪同 | 中国城市社区卫生服务中心，林医生 | 细心、倾听、关心与合作 |
| 我想成为消防员 | 小宇，爸爸陪同 | 中国城市消防站开放日，刘叔叔 | 训练、团队配合与安全意识 |
| 我想成为老师 | 朵朵，爸爸妈妈一起参与 | 中国城市幼儿园，陈老师 | 陪伴、鼓励、探索与情绪支持 |

三本各有 16 页正文，另加 1 张带中文书名的封面；每本播放器共 17 个画面。每本由一个不同的五岁孩子表达自己的职业理想，独立成篇，面向幼儿园。对话采用中文双引号“”。

## 视觉与素材

参考用户提供的职业绘本图片：明亮蓝、黄、红配色，圆润人物、豆豆眼、红脸颊、柔和立体感。使用新创作的中国人物和城市场景，封面采用统一的深蓝圆体字和白色描边。

- 生成方法：内置 `image_gen.imagegen`，先制作三本封面，再以各自封面作为人物与画风参考逐页独立生成。生成图片保留在原生成目录，选定图片复制并压缩到项目。
- 本地素材目录：`apps/web/public/picture-book-demos/careers/`。`doctor/`、`firefighter/`、`teacher/` 的选定封面和 16 张正文图，均为 WebP 960×1280，严格 3:4，质量 88；`series-cover-v2.webp` 为 1600×900 的系列资源封面。保留旧版及中间修订图用于来源追溯，实际选择以清单中的 `assetName` 为准。
- `scripts/picture-books/career-series-data.mjs`：完整中文文稿、角色与分镜；`career-cast.mjs`：每本孩子、家长和逐页配角；`career-generation-manifest.json`：52张选定素材的提示词、参考图、原始路径及版本。
- 人物修订选定 36 张新图：消防员与老师的封面和全部 16 页，医生第 15 页母亲发型修正，以及三个孩子的系列封面。消防员第 3、10 页为 `-v3.webp`，老师第 14 页为 `14-v3.webp`，其余本次修订采用 `-v2.webp`。`career-identity-generation-manifest.json` 保留完整编辑记录（包括保育老师第14页的中间稿）和视觉核对结果。
- `career-publication-manifest.json`：当前52张已上传素材的 ID、公开 URL、尺寸、字节数、SHA-256，以及正式资源和修订审核 ID；`career-publication-v1-manifest.json` 为首发历史清单。

人物连续性：小安穿黄色短袖与青蓝色背带裤，小宇穿翠绿短袖与深蓝短裤，朵朵穿淡紫色白领裙并戴黄色星形发夹。三位家长组合各自固定外形。陈老师、米米、浩浩同时出现于老师篇和消防员第15页，沿用同一人物设定；保育老师刘阿姨的午餐与备课场景采用同一低盘发、浅桃色白领短袖工作服。逐页提示词只加入实际出场角色，避免将封面职业人物带入家庭场景。

插画场景依据中国现有社区健康服务、消防站参观和幼儿园活动安排：社区儿童保健参照[国家卫生健康委基层卫生服务通知](https://www.nhc.gov.cn/jws/c100073/202606/20c3486dc9ba4c09a9747547d4e841ad.shtml)及[儿童健康管理服务规范](https://www.nhc.gov.cn/cms-search/downFiles/cbf5c9f643d240ac9ec1b6a4f4bcbe6a.pdf)；消防站参观参考[应急管理部消防开放活动](https://www.mem.gov.cn/xw/jyll/202306/t20230601_452416.shtml)，报警情境参照[119 消防安全知识](https://www.mem.gov.cn/kp/shaq/201904/t20190401_366005.shtml)；幼儿园篇以游戏和一日生活为主，参照[教育部幼儿园保育教育质量评估指南](https://www.moe.gov.cn/srcsite/A06/s3327/202202/t20220214_599198.html)。儿童在专业场景中由成人陪伴参观，家庭和幼儿园中的职业扮演使用玩具。

## 数据与发布

允许修改范围为本系列文稿、素材、导入脚本及本文档；复用现有 PictureBook、MediaAsset、Course 与课程审核服务。无需数据库 schema、migration 或通用 seed 变更。

作者：`abei-lele-studio`。正式作品 ID：`abei-career-doctor`、`abei-career-firefighter`、`abei-career-teacher`。系列资源 ID：`e2edf14f892a944946c00c80`，保持原地址。首发审核记录为 `cmv1a7yvw0000i2mxayyb1323`。

2026-10-10 人物修订通过三条正式课件变更审核：医生 `cmv1njhsz0000wsmz60dmtxb3`，消防员 `cmv1njhub0002wsmze7uewnug`，老师 `cmv1njhv10004wsmzzchksgm8`；系列新版本审核为 `cmv1njhwz000dwsmzasoy4irx`。四条审核各有一条管理员操作日志。

`revise-career-series.mjs` 用于本次已发布系列修订。`career-v1-baseline.json` 冻结首发原稿及资源信息；仅允许完整原稿或本次完整目标稿，任何人工编辑或拒绝状态都会停止执行。`prepare` 只上传并核验素材与目标范围，`publish` 使用版本 CAS 替换三本原稿，通过现有 `recordMaterialChange`、`approve` 更新课件；随后使用现有 `saveCourse`、`submitCourse`、`approve` 更新系列版本。保存前的行锁复核和业务保存共享事务，防止上传期间出现的人工草稿被覆盖。重跑时复用目标版本和审核日志。

`publish-career-series.mjs` 使用现有上传、资源创建、投稿与审核服务，素材进入已配置的 abei R2 存储；每次上传或恢复均读取存储对象并核验本地 SHA-256。`prepare` 只完成素材、正式作品和资源草稿，`publish` 再提审并批准。批准前核对资源目录与三本原稿的固定快照，检测重复图片、人工修改、错误归属和重复运行。已发布资源不会重复创建或重复审核；被拒绝的投稿不能自动重审。恢复清单可使用已保存的发布清单，不含环境配置或密钥。

仅对 abei 数据库执行；不修改工作室密码、钱包及原《熊猫乐乐的森林朋友》系列。本次核对作者认证字段、钱包、12 本原绘本和原系列的摘要，均与导入前一致。

## 验证

- `node --test scripts/picture-books/career-import.test.mjs scripts/picture-books/career-revision.test.mjs`：10/10 通过，覆盖人物家长组合、逐页配角、缺页、错误归属、人工修改、拒绝恢复、审核绑定及保存时并发草稿保护。
- `node --check scripts/picture-books/revise-career-series.mjs`：通过。独立代码审查已复核修订与批准范围。
- `DATABASE_URL='postgresql://test:test@127.0.0.1:3609/abei?schema=public' pnpm --filter @xueleai/api-core exec node --import tsx --test --test-concurrency=1 tests/course-review-service.test.ts tests/picture-book-playback.test.ts tests/picture-book-r2-image.test.ts tests/picture-book-image.test.ts`：37 项通过，1 项数据库专用集成测试按默认条件跳过。第一次本机启动因缺少 `DATABASE_URL` 未进入审核测试，补上不可达测试占位地址后通过。
- 本地真实业务验证：3 本 COMPLETED、16 页正文加封面、3:4；3 个 APPROVED 课件快照与新文稿和人物一致；普通非作者账号读取每本17个新画面；仍只有1个系列，本次新增4条审核及4条对应日志；52张选定素材在上传/发布时通过R2签名读取与SHA-256核对；已发布状态的恢复检查通过。
- 浏览器确认新系列简介与三孩子封面、小宇和爸爸的第1页、朵朵和爸爸妈妈的入园及家庭页，配文与图片一致。账号认证字段、钱包、原乐乐12本及156段配音、原系列版本与公开快照的摘要保持不变。

本次没有前端代码、路由、依赖或构建配置变更，未运行全量 lint、typecheck、build、install 或 migration；采用与文稿导入和既有发布流程直接相关的测试及真实环境验真。没有执行 GitHub 推送或生产部署。
