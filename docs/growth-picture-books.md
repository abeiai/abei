# 《长大以后，我是谁？》科普绘本

依据用户提供的四册、48页方案制作，每种动物采用幼态谜面、觅食与生存、生长变化、成体揭晓的四页结构。每册12页正文，加带中文书名的封面，共52张阅读图片；书内图片为5:4，1280×1024。资源中心另有16:9系列封面，以符合既有封面上传契约。

四册依次为《树林里的铠甲勇士》《从池塘飞向天空》《浪花里的奇妙变身》《换上美丽的新衣裳》。采用自然写实水彩与铅笔线稿，图中文字由内置 image_gen 直接生成；Sharp只用于尺寸统一、WebP编码和核对用联系表，没有额外叠字。

脚本和最终提示词：`scripts/picture-books/growth-series-data.mjs`；每张图的来源、提示词及选稿记录：`growth-generation-results/`、`growth-assets-manifest.json`。交付素材：`apps/web/public/picture-book-demos/growth/`。53张素材齐全，已核对尺寸、全部文字和动物形态；通过固定既有作者 `abei-lele-studio` 的正常课程投稿、管理员审核服务建立四册系列，不覆盖旧绘本。

本地与线上已发布入口：[《长大以后，我是谁？》](https://new.abeiai.com/c/1885e24ff148bd1a9a877cdd)。系列状态PUBLISHED、审核版本APPROVED，四个绘本课件均APPROVED，保留管理员审核日志。匿名用户可查看系列目录，播放遵循平台既有登录规则，未额外改变绘本馆公开权限。

## 2026-10-10 线上同步

四册共52张阅读画面、另有1张系列封面；封面与正文共52段 Minimax `speech-2.8-hd` / `Chinese_huolishaonv` 配音。脚本 `growth-narration.mjs` 与 `narrate-growth-series.mjs` 完成了本地逐页配音和五条正式审核记录；`growth-production-sync.mjs` 与 runner 将该已审核版本选择性同步到独立生产实例。没有数据库 migration 或 seed 更新，也没有修改生产应用源码。

GitHub `main` 已包含同步脚本，发布提交为 `922cb23`。生产应用继续运行已具备绘本图片内文字和配音播放能力的 `99acec7` 版本；本次只传输已核验的业务数据包及一次性运维脚本，不重建应用容器。服务器发布目录 `/opt/abei` 不是 Git 仓库。私有包、写入前目标记录、同步结果及复验记录保存在 `/opt/abei/deploy/data/growth-sync/20261010-animal-growth/`，目录权限700、数据文件权限600，均未加入Git。同步包 SHA-256 为 `439ad5b045be9a7b3155b50a33afad5000f8cebd82a653e8b3fb5b40c6153560`。

生产端使用自身 R2 配置签名读取全部53张WebP和52段音频，逐份核对字节数与SHA-256，图片同时核对尺寸和类型。只同步本专辑的媒体、音频、绘本、课件公开快照、课程、目录、五条审核请求及审核日志；生产原有作者与管理员身份只读核对，账号、密码、钱包、提供商配置和其他作品不复制。写入采用单个可序列化事务，已有行逐字段冲突保护。首次新增130行；九表前后计数匹配，范围外业务、作者账号及钱包摘要不变。

独立 `abei_growth_sync_test:3608` PostgreSQL 验证了故障回滚、首次导入、零写入重放和目标冲突保护。生产服务复验读取四册共52个画面，52个音频地址及内嵌文字标记均与批准快照一致。公网 `/api/health`、`/api/health/db`、`/api/health/redis`、`/api/system-config/public` 均返回HTTP200与`code=0`；系列页面HTTP200并包含四册标题。验证时生产应用版本为 `0.0.16`、revision `99acec7`。

## 科普校正依据

- 瓢虫的鞘翅坚硬，透明的是后翅；幼虫和成虫均捕食蚜虫：[肯塔基大学昆虫学资料](https://www.uky.edu/Ag/CritterFiles/casefile/insects/beetles/lady/lady.htm)。
- 蝉的末次蜕皮和雄性发声机制：[美国自然历史博物馆](https://www.amnh.org/explore/news-blogs/periodical-cicadas-overview)。只引用共有机制，不把北美周期蝉的固定年数用于中国蝉。
- 蝌蚪成长时尾巴被吸收、四肢长出：[英国自然历史博物馆](https://www.nhm.ac.uk/discover/news/2022/november/tadpoles-have-eye-on-future-as-vision-develops.html)。
- 蜻蜓没有蛹期，水生幼虫直接蜕皮成为成虫：[英国蜻蜓学会](https://british-dragonflies.org.uk/odonata/life-cycle-and-biology/)。
- 库蚊的幼虫、蛹、成虫阶段与水面呼吸结构：[美国疾控中心库蚊生命周期资料](https://stacks.cdc.gov/view/cdc/85908/Print)，[蚊蛹不进食](https://wwwn.cdc.gov/phil/Details.aspx?pid=26037)。
- 比目鱼眼睛迁移至同侧、盲侧贴底；不声称所有种类迁移方向相同：[原始研究](https://pmc.ncbi.nlm.nih.gov/articles/PMC6095868/)。
- 海蟹经历溞状幼体、大眼幼体及幼蟹，腹部折到下方，并继续蜕皮长大：[佛罗里达鱼类与野生动物委员会](https://myfwc.com/research/saltwater/crustaceans/blue-crabs/life-cycle/)。八条步足加两只螯为十足。
- 选择海月水母，展示水螅体横裂生殖、碟状幼体与成体；不使用“深海发光水晶伞”的泛化说法：[蒙特雷湾水族馆](https://www.montereybayaquarium.org/animals-the-ocean/animals-a-to-z/moon-jelly)。
- 麋鹿采用湿地生境、长尾、宽蹄及向后分叉的雄鹿角：[国家林业和草原局](https://www.forestry.gov.cn/c/www/sdfc/24451.jhtml)，[麋鹿成长和茸角](https://www.forestry.gov.cn/lyj/1/zhzs/20260625/676107.html)。
- 丹顶鹤幼鸟与成年羽色不同，成年红顶为裸露皮肤：[史密森尼国家动物园](https://www.nationalzoo.si.edu/animals/red-crowned-crane)。
- 火烈鸟幼鸟灰白、嘴较直；父母均喂育雏乳，食物中的类胡萝卜素参与羽色形成：[圣迭戈动物园](https://animals.sandiegozoo.org/animals/flamingo)。

## 验证

阅读器新增可选 `textInImage:true`：仅显式true进入审核快照，其余值不改变旧快照哈希；配文保留供无障碍读取，视觉上不叠字幕。来源及发布脚本要求四本、48页独立正文、全部封面齐全，验证尺寸、文稿、页序、53份不同素材及R2哈希。投稿与审批在锁定事务内复核原稿、课件公开版本、审核请求及管理员身份，拒绝并发改变的授权内容。

已执行新增回归测试的失败→通过循环、API快照与播放21项测试、导入与审核保护4项测试、两端类型检查、前端606项测试及本地Web/API镜像构建。四册均通过实际原生播放服务核对审核快照，返回52张5:4、`textInImage:true`的阅读图片。最终53张图片逐页OCR并配合联系表人工核对；三处OCR误识经过原图人工校对，记录绑定素材SHA256，图片变化后不沿用人工结论。所有53份R2素材回读哈希与交付文件相同。旧28本绘本、其审核快照以及账号与钱包记录的前后指纹一致；新增四本、52张阅读图片和一个系列资源。没有数据库schema迁移，也没有重置或修改既有账号。
