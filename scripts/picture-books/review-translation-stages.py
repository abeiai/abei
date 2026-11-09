"""Review the private English-to-Chinese translation checkpoints before publishing.

Install opencc-python-reimplemented in a temporary Python environment and run
against a private copy of the stage directory. Only copy reviewed JSON files
back to production; the production runner validates them against source hashes.
"""

import argparse
import json
import os
from pathlib import Path

from opencc import OpenCC


# Reviewed against the complete source page and its translated caption.
REPLACEMENTS = {
    "storyweaver-188295": {page: [("南瓜 crush", "南瓜怪")] for page in (0, 2, 3, 4, 5, 6, 7, 8)},
    "storyweaver-47915": {0: [("窸窣 bustling", "窸窣忙碌")], 1: [("窸窣\nbustling", "窸窣\n忙碌")], 5: [("窸窣\nbustling", "窸窣\n忙碌")]},
    "storyweaver-606877": {0: [("mighty betel nut树", "强壮的槟榔树")], 10: [("mighty betel nut树", "强壮的槟榔树")], 13: [("mighty：卡兰博尔", "卡兰博尔")], 14: [("mighty betel nut树", "强壮的槟榔树")]},
    "storyweaver-303438": {2: [("， ready 做可塔", "，可以做可塔")]},
    "storyweaver-24754": {25: [("迪帕 ready 在里约", "迪帕准备在里约")]},
    "storyweaver-43613": {14: [("整洁又 ready 上学啦", "整洁又准备好去上学啦")]},
    "storyweaver-207": {15: [("lots of glue（很多胶水）", "足够多的胶水")]},
    "storyweaver-248939": {4: [("长尾巴 snugly（ snugly 保留原意，译为“紧紧”）裹住自己", "长尾巴紧紧裹住自己")]},
    "storyweaver-171193": {15: [("\n\n\n\n**够啦：此处 loosely 译为“够啦！”，常用于戛然终结争论。", "")]},
    "storyweaver-171173": {6: [("萨菲 ready to scratch", "萨菲已经准备好伸爪抓人了")]},
    "storyweaver-17482": {5: [("ready to drink（随时能喝）", "已经可以喝了")]},
    "storyweaver-193507": {13: [("扑向灯光 fluttering up to the light", "扑向灯光")]},
    "storyweaver-25805": {7: [("神奇摩托车 ready to go 啦", "神奇摩托车准备出发啦"),
                              ("dhup, dhup, dhup", "咚、咚、咚"),
                              ("clap-clap, clap-clap, clap-clap", "啪啪，啪啪，啪啪")]},
    "storyweaver-329919": {5: [("ready to go", "准备出发了")]},
    "storyweaver-540838": {3: [("replenish our groundwater and feed our rivers.", "补充地下水，滋养河流。")]},
    "storyweaver-184988": {0: [("散漫 chatter [2]", "东拉西扯 [2]")], 2: [("散漫 chatter", "东拉西扯")]},
    "storyweaver-184891": {0: [("散漫 chatter [1]", "东拉西扯 [1]")], 2: [("散漫 chatter", "东拉西扯")]},
    "storyweaver-41052": {9: [("猴子们 chatter 着", "猴子们叽叽喳喳地叫着")]},
    "storyweaver-8223": {18: [("猴子吱吱 chatter", "猴子吱吱喳喳"),
                               ("孩子们咯咯 giggling", "孩子们咯咯地笑"),
                               ("裁缝呵呵 chortle", "裁缝呵呵笑出了声")]},
    "storyweaver-94850": {5: [("ready to sail", "已经可以启航")]},
    "storyweaver-665470": {1: [("chatter 声", "说笑声")]},
    "storyweaver-130381": {7: [("ready for planting（准备好播种）", "可以播种了")]},
    "storyweaver-266069": {2: [("新发明的 gadgets", "新式小玩意儿")]},
    "storyweaver-1101": {14: [("ready to run down the giant one-feathered elephant bird", "准备冲上去打倒那只只有一根羽毛的巨型大象鸟")]},
    "storyweaver-359366": {1: [("lots\n\n\nand lots 的燃料", "好多好多燃料")]},
    "storyweaver-442736": {10: [("鳄鱼追着狗跑 down the road。", "鳄鱼沿着路追赶狗。")]},
    "storyweaver-29681": {8: [("ready to swallow", "准备吞掉她们")]},
    "storyweaver-24505": {15: [("lots of green rice to eat", "好多青米饭吃")]},
    "storyweaver-361239": {
        1: [("四（B）班", "四年级B班")],
        9: [("我考了88分", "我考了88%")],
        11: [("上十一班", "上十一年级")],
    },
    "storyweaver-650968": {24: [("yanshahbo（雅奥帕）", "烟沙博")]},
    "storyweaver-651910": {1: [("喧闹与 chatter", "喧闹和说笑声")]},
    "storyweaver-657262": {
        0: [("我们家的心脏", "家的心")],
        4: [("孔亚克族", "科尼亚克族")],
        6: [("孔亚克族", "科尼亚克族")],
    },
    "storyweaver-664155": {
        0: [("我们身份的织物", "衣裳里的身份")],
        2: [("国家科学基金会（NSF）项目", "NSF的活动")],
        7: [("孔亚克族", "科尼亚克族")],
        10: [("蓬桑巴姆", "波通桑巴姆")],
        13: [("塔什·冲·舍尔巴", "塔希·琼·舍尔巴")],
        14: [("查琳妮·巴苏马塔里", "查利尼·巴苏马塔里")],
        15: [("孔亚克族", "科尼亚克族")],
    },
    "storyweaver-139804": {2: [("400百万年前", "4亿年前"), ("65百万年前", "6500万年前")]},
    "storyweaver-152051": {13: [("4.6亿年", "46亿年"), ("13.2亿年", "132亿年"), ("13.8亿年", "138亿年")]},
    "storyweaver-268344": {13: [("200百万年", "2亿年")]},
    "storyweaver-5205": {7: [("40 BILLION个", "400亿个")]},
    "storyweaver-53256": {14: [("1.3亿人", "13亿人"), ("1.3亿！", "13亿！")]},
    "storyweaver-55713": {13: [("500百万年前", "5亿年前")]},
    "storyweaver-61595": {18: [("两千多万年前", "两千万年前")]},
    "storyweaver-541242": {23: [("成千上万只阿穆尔隼", "数十万只阿穆尔隼")]},
    "storyweaver-58665": {5: [("数到‘克若尔’", "数到上千万")]},
    "storyweaver-69028": {
        12: [("5亿女性", "5000万女性"), ("2.7亿个LPG连接", "2700万个LPG连接")],
        13: [("1亿女性", "1000万女性")],
    },
    "storyweaver-34983": {12: [("一百亿", "十亿")]},
    "storyweaver-188181": {
        7: [("一千万卢比", "一百万卢比"), ("五百万", "五十万")],
        8: [("五百万", "五十万"), ("两百万", "二十万")],
        9: [("两百万卢比", "二十万卢比")],
        27: [("十亿卢比", "一百万卢比")],
        38: [("一千万卢比", "一百万卢比")],
    },
}
TITLE_REPLACEMENTS = {
    "storyweaver-188295": ("南瓜 crush", "南瓜怪"),
    "storyweaver-47915": ("窸窣 bustling", "窸窣忙碌"),
    "storyweaver-606877": (" mighty betel nut树", "强壮的槟榔树"),
    "storyweaver-184988": ("散漫 chatter [2]", "东拉西扯 [2]"),
    "storyweaver-184891": ("散漫 chatter [1]", "东拉西扯 [1]"),
    "storyweaver-657262": ("我们家的心脏", "家的心"),
    "storyweaver-664155": ("我们身份的织物", "衣裳里的身份"),
}
FULL_PAGE_REPLACEMENTS = {
    ("storyweaver-104742", 8): (
        "lots\nof\nnoise",
        "我们\n发出\n很大的\n声响。\n哇啊——！\n呃啊啊……\n啊啊啊！",
    ),
    ("storyweaver-608851", 14): (
        "tucked此处译为",
        "动手做一做\n\n嘿，你好！准备好创造点神奇的东西了吗？\n让我们用一片菠萝蜜叶，亲手做一头特别的公牛吧！照着下面的步骤来：\n1. 拿一片菠萝蜜叶。\n2. 沿叶子两侧第一排叶脉剪出牛角；再剪掉叶尖，留下中间那根叶脉作尾巴。\n3. 将左右两边向内折拢，塞入牛角下方。",
    ),
}
ACCEPTED_EQUIVALENTS = {
    ("storyweaver-69028", 12, "2.7亿个LPG连接"): ("2700万份LPG入户连接",),
    ("storyweaver-49732", 14, "你们 anywhere 看见破洞了吗"): ("你们在哪儿看见破洞了吗",),
}
LANGUAGE_LEAK_FIXES = {
    "storyweaver-167906": {7: [("都 eager 想和", "都急着想和")]},
    "storyweaver-16573": {3: [("我 surely 是", "我一定是")], 13: [("灰色 surely 才是", "灰色才是")]},
    "storyweaver-177414": {4: [("awareness（意识）", "关注"), ("still（仍然）", "仍然")]},
    "storyweaver-11166": {10: [("试了 EVERYTHING", "什么办法都试了")]},
    "storyweaver-51955": {8: [("花上 forever", "花上好久好久")]},
    "storyweaver-507800": {3: [("我 spotting 一条鲸鱼", "我看到一条鲸鱼")], 6: [("我 spotting 一个气球", "我看到一个气球")]},
    "storyweaver-24195": {8: [("狭窄、 dusty 的小路", "狭窄、尘土飞扬的小路")]},
    "storyweaver-679933": {9: [("barely 比一座房子大不了多少", "只比一座房子大一点点")]},
    "storyweaver-26690": {6: [("yummy！", "真好吃！")]},
    "storyweaver-665072": {6: [("可能 already 到那儿啦", "可能已经到那儿啦")]},
    "bookdash-lets-party": {8: [("yummy～", "真香～")], 15: [("yummy～", "真香～")]},
    "storyweaver-610722": {1: [("我们 festival 穿什么呀", "过节时我们穿什么呀")]},
    "storyweaver-91637": {12: [("yummy！", "真美味！")], 17: [("creepy crawlies", "爬来爬去的小虫子")]},
    "storyweaver-27612": {8: [("成百只 tiny 小蜘蛛", "成百只小蜘蛛")]},
    "storyweaver-292656": {13: [("永别， forever", "永别，永远不见了")]},
    "storyweaver-327645": {16: [("维拉 snug 地坐在", "维拉舒舒服服地坐在")]},
    "storyweaver-171892": {12: [("咱们 neighborhood 一有人", "咱们街坊邻里一有人")]},
    "bookdash-grumpy-cloud": {10: [("云 STILL 在那儿", "云还在那儿")]},
    "storyweaver-27121": {1: [("我 bedtime 之前就回来", "我睡前就回来")]},
    "storyweaver-593495": {21: [("对 eager 的年轻理发师说", "对满怀期待的年轻理发师说")]},
    "storyweaver-374689": {21: [("yummy！", "真好吃！")]},
    "storyweaver-7710": {1: [("小 gadget 的东西", "小装置的东西")], 4: [("小 gadget", "小装置"), ("gadget 一下子", "小装置一下子")], 9: [("各种 gadget 和机器", "各种小装置和机器")]},
    "storyweaver-339109": {4: [("罐子里 already 有", "罐子里已经有")], 6: [("蛋托里 already 有", "蛋托里已经有")], 7: [("且 already 有", "且已经有")]},
    "storyweaver-49732": {14: [("你们 anywhere 看见破洞了吗", "你们看见哪里有破洞了吗"), ("你们在哪儿看见破洞了吗", "你们看见哪里有破洞了吗")]},
    "storyweaver-24193": {6: [("THREE\n困惑的保安", "三个困惑的保安")], 8: [("FOUR\n兴奋的清扫工", "四个兴奋的清扫工")]},
    "storyweaver-139044": {5: [("把 everyone 都惹烦了", "把大家都惹烦了")]},
    "storyweaver-32292": {10: [("dusty 的小路", "尘土飞扬的小路")]},
    "storyweaver-139032": {5: [("THREE 个抽屉", "三个抽屉")], 6: [("FOUR 颗糖", "四颗糖")], 13: [("ONE 枚硬币，\nTWO 袋茶包，\nTHREE 支笔，\nFOUR 张卡片，\nFIVE 根发卡，\nSIX 把钥匙，\nSEVEN 张账单，\nEIGHT 粒纽扣\n和 NINE 颗核桃", "一枚硬币，\n两袋茶包，\n三支笔，\n四张卡片，\n五根发卡，\n六把钥匙，\n七张账单，\n八粒纽扣\n和九颗核桃")]},
    "storyweaver-39756": {1: [("yummy！", "真香！")]},
    "storyweaver-303153": {3: [("可怕的 bedtime", "可怕的睡觉时间")]},
    "storyweaver-595559": {23: [("yummy！", "真美味！")]},
    "storyweaver-41228": {2: [("Uncle 的棕榈糖", "叔叔的棕榈糖"), ("Aunty 打完水", "阿姨打完水")], 7: [("Aunty 边追狗", "阿姨边追狗")], 8: [("Aunty 一边从地上", "阿姨一边从地上")], 9: [("Aunty 打开", "阿姨打开")]},
    "storyweaver-39736": {14: [("yummy！ yummy！ yummy！", "好吃！好吃！好吃！")]},
    "storyweaver-653132": {25: [("始终 untouched", "始终无人触碰")]},
    "storyweaver-11987": {0: [("yummy！", "真好吃！")], 1: [("yummy！yummy！yummmmmm！", "真好吃！真好吃！太好吃啦！"), ("yummy！", "真好吃！")], 21: [("yummy！", "真好吃！")], 27: [("yummy！", "真好吃！")]},
    "storyweaver-655300": {3: [("觉得 creepy", "觉得毛骨悚然")]},
    "storyweaver-58291": {14: [("neighborhood 的孩子们", "附近的孩子们")]},
    "storyweaver-92910": {46: [("测量 EVERYTHING", "测量一切")]},
    "storyweaver-4991": {3: [("大小 barely 比一颗豌豆大一点", "大小只比一颗豌豆大一点")], 18: [("snug 的树洞新家", "舒适的树洞新家")]},
    "storyweaver-259229": {14: [("untouched（ untouched 保留英文原词，因前文已建立“不碰、不挪、不打扰”的语义共识）", "留在原地，不去触碰") ]},
    "storyweaver-443687": {4: [("yummy……", "真好吃……")]},
    "storyweaver-366151": {14: [("tiny 鱼苗", "微小的鱼苗")]},
    "storyweaver-31970": {2: [("yummy-yum-yum！", "好吃好吃真好吃！")]},
    "storyweaver-17480": {17: [("全国上下 anywhere 都能买到", "全国各地都能买到")]},
    "storyweaver-611412": {5: [("一位 worthy 的人", "一位合适的人")], 7: [("他是否 worthy", "他是否配得上这份使命")]},
    "storyweaver-105363": {8: [("FOUR 只眼睛", "四只眼睛")]},
    "storyweaver-569694": {1: [("学校里 everyone 都在", "学校里人人都在")]},
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("directory", type=Path)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--drafts", action="store_true", help="Also review unfinished private draft checkpoints")
    options = parser.parse_args()
    converter = OpenCC("t2s")
    changed_books = 0
    changed_captions = 0
    missing = []
    pending = []
    for path in sorted(options.directory.glob("*.json")):
        if (path.name.endswith(".draft.json") and not options.drafts) or path.name in {"publish-baseline.json"}:
            continue
        with path.open(encoding="utf-8") as file:
            stage = json.load(file)
        if "translation" not in stage and not (options.drafts and path.name.endswith(".draft.json") and "pages" in stage):
            continue
        book_id = stage["id"]
        translation = stage.get("translation", stage)
        original = json.dumps(translation, ensure_ascii=False, sort_keys=True)
        translation["title"] = converter.convert(translation["title"])
        if book_id in TITLE_REPLACEMENTS:
            old, new = TITLE_REPLACEMENTS[book_id]
            if translation["title"] == old:
                translation["title"] = new
            elif translation["title"] != new:
                missing.append(f"{book_id}:title: {old}")
        for page in translation["pages"]:
            caption = converter.convert(page["caption"])
            full_page = FULL_PAGE_REPLACEMENTS.get((book_id, page["position"]))
            if full_page:
                marker, replacement = full_page
                if marker in caption:
                    caption = replacement
                elif caption != replacement:
                    missing.append(f"{book_id}:{page['position']}: {marker}")
            if book_id == "storyweaver-34983":
                for old, new in [("奈米", "纳米"), ("公尺", "米"), ("资讯", "信息"),
                                 ("看著", "看着"), ("穿著者", "穿着者")]:
                    caption = caption.replace(old, new)
            for old, new in REPLACEMENTS.get(book_id, {}).get(page["position"], []) + LANGUAGE_LEAK_FIXES.get(book_id, {}).get(page["position"], []):
                if old not in caption and new not in caption and not any(
                    equivalent in caption for equivalent in ACCEPTED_EQUIVALENTS.get((book_id, page["position"], old), ())
                ):
                    missing.append(f"{book_id}:{page['position']}: {old}")
                elif old in caption:
                    caption = caption.replace(old, new)
            if page["caption"] != caption:
                changed_captions += 1
            page["caption"] = caption
        if json.dumps(translation, ensure_ascii=False, sort_keys=True) != original:
            changed_books += 1
            pending.append((path, stage))
    print(json.dumps({"changedBooks": changed_books, "changedCaptions": changed_captions,
                      "missingExpectedPhrases": missing, "applied": options.apply and not missing}, ensure_ascii=False))
    if missing:
        raise SystemExit("校审词组未全部找到，未写入任何文件")
    if options.apply:
        for path, stage in pending:
            temp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
            with temp.open("w", encoding="utf-8") as file:
                json.dump(stage, file, ensure_ascii=False, separators=(",", ":"))
            os.chmod(temp, 0o600)
            temp.replace(path)


if __name__ == "__main__":
    main()
