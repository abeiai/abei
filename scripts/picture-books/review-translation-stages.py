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
ACCEPTED_EQUIVALENTS = {
    ("storyweaver-69028", 12, "2.7亿个LPG连接"): ("2700万份LPG入户连接",),
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
        for page in translation["pages"]:
            caption = converter.convert(page["caption"])
            if book_id == "storyweaver-34983":
                for old, new in [("奈米", "纳米"), ("公尺", "米"), ("资讯", "信息"),
                                 ("看著", "看着"), ("穿著者", "穿着者")]:
                    caption = caption.replace(old, new)
            for old, new in REPLACEMENTS.get(book_id, {}).get(page["position"], []):
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
