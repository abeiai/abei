#!/usr/bin/env python3
"""Convert one textbook PDF into Markdown with MinerU, Nougat and PaddleOCR.

The script is intentionally local-first: it writes page images and extracted
assets into the asset directory provided by the TypeScript batch importer, then
returns a JSON payload containing the generated Markdown file path and metadata.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
from typing import Any


ENGINE_VERSION = "mineru-3.3.1-nougat-0.1.17-paddleocr-3.7.0-v1"
DEFAULT_PAGE_IMAGE_WIDTH = 1024
DEFAULT_SUBPROCESS_TIMEOUT = 20 * 60
NOUGAT_COMPAT_RUNNER = r"""
import sys
from nougat import model as nougat_model

original = nougat_model.BARTDecoder.prepare_inputs_for_inference

def patched_prepare_inputs_for_inference(
    self,
    input_ids,
    encoder_outputs,
    past=None,
    past_key_values=None,
    use_cache=None,
    attention_mask=None,
    cache_position=None,
    **kwargs,
):
    return original(
        self,
        input_ids,
        encoder_outputs,
        past=past,
        past_key_values=past_key_values,
        use_cache=use_cache,
        attention_mask=attention_mask,
    )

nougat_model.BARTDecoder.prepare_inputs_for_inference = patched_prepare_inputs_for_inference

from predict import main

sys.argv = ["nougat", *sys.argv[1:]]
raise SystemExit(main())
"""


@dataclass
class Request:
    pdf_path: Path
    asset_dir: Path
    asset_base_url: str
    output_markdown_path: Path
    textbook_id: str
    title: str
    education_type: str
    subject: str
    version: str
    grade: str
    volume: str
    publisher: str | None
    page_image_width: int
    max_pages: int
    model_cache_dir: Path
    nougat_max_pages: int
    mineru_method: str
    subprocess_timeout: int


class ConversionError(RuntimeError):
    pass


class PaddleFallback:
    def __init__(self) -> None:
        self._ocr = None

    def recognize(self, image_path: Path) -> str:
        if self._ocr is None:
            from paddleocr import PaddleOCR

            self._ocr = PaddleOCR(
                lang="ch",
                use_doc_orientation_classify=False,
                use_doc_unwarping=False,
                use_textline_orientation=True,
            )

        results = self._ocr.predict(input=str(image_path))
        if not results:
            return ""

        result = results[0]
        texts = result.get("rec_texts", []) if hasattr(result, "get") else []
        scores = result.get("rec_scores", []) if hasattr(result, "get") else []
        lines: list[str] = []

        for index, text in enumerate(texts):
            score = float(scores[index]) if index < len(scores) else 1.0
            text = normalize_text(str(text))
            if text and score >= 0.35:
                lines.append(text)

        return "\n".join(lines)


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("用法：textbook_pdf_to_markdown_pipeline.py request.json")

    request_path = Path(sys.argv[1]).resolve()
    request = parse_request(json.loads(request_path.read_text(encoding="utf-8")))
    configure_runtime_env(request.model_cache_dir)

    request.asset_dir.mkdir(parents=True, exist_ok=True)
    page_count = get_pdf_page_count(request.pdf_path, request.subprocess_timeout)
    converted_page_count = min(page_count, request.max_pages) if request.max_pages > 0 else page_count

    with tempfile.TemporaryDirectory(prefix="xueleai-textbook-md-") as temp_dir_name:
        temp_dir = Path(temp_dir_name)
        page_images = render_page_images(request, converted_page_count)
        mineru_pages, mineru_asset_count = run_mineru(request, temp_dir, converted_page_count)
        nougat_result = run_nougat(request, temp_dir, converted_page_count)
        page_markdown, paddle_pages = build_pages_markdown(request, mineru_pages, page_images, converted_page_count)
        markdown = render_textbook_markdown(
            request=request,
            page_count=page_count,
            converted_page_count=converted_page_count,
            page_markdown=page_markdown,
            mineru_asset_count=mineru_asset_count,
            paddle_pages=paddle_pages,
            nougat_result=nougat_result,
        )

    request.output_markdown_path.parent.mkdir(parents=True, exist_ok=True)
    request.output_markdown_path.write_text(markdown, encoding="utf-8")

    payload = {
        "markdownPath": str(request.output_markdown_path),
        "pageCount": page_count,
        "convertedPageCount": converted_page_count,
        "markdownBytes": len(markdown.encode("utf-8")),
        "assetDir": str(request.asset_dir),
        "engineVersion": ENGINE_VERSION,
        "mineruAssetCount": mineru_asset_count,
        "paddleFallbackPages": paddle_pages,
        "nougatStatus": nougat_result["status"],
        "nougatReason": nougat_result.get("reason"),
    }
    print(json.dumps(payload, ensure_ascii=False))


def parse_request(data: dict[str, Any]) -> Request:
    return Request(
        pdf_path=Path(data["pdfPath"]).resolve(),
        asset_dir=Path(data["assetDir"]).resolve(),
        asset_base_url=str(data["assetBaseUrl"]).rstrip("/"),
        output_markdown_path=Path(data["outputMarkdownPath"]).resolve(),
        textbook_id=str(data["textbookId"]),
        title=str(data["title"]),
        education_type=str(data["educationType"]),
        subject=str(data["subject"]),
        version=str(data["version"]),
        grade=str(data["grade"]),
        volume=str(data["volume"]),
        publisher=data.get("publisher"),
        page_image_width=int(data.get("pageImageWidth") or DEFAULT_PAGE_IMAGE_WIDTH),
        max_pages=int(data.get("maxPages") or 0),
        model_cache_dir=Path(data["modelCacheDir"]).resolve(),
        nougat_max_pages=int(data.get("nougatMaxPages") or 0),
        mineru_method=str(data.get("mineruMethod") or "ocr"),
        subprocess_timeout=int(data.get("subprocessTimeout") or DEFAULT_SUBPROCESS_TIMEOUT),
    )


def configure_runtime_env(model_cache_dir: Path) -> None:
    model_cache_dir.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("HOME", str(model_cache_dir))
    os.environ.setdefault("XDG_CACHE_HOME", str(model_cache_dir))
    os.environ.setdefault("HF_HOME", str(model_cache_dir / "huggingface"))
    os.environ.setdefault("NLTK_DATA", str(model_cache_dir / "nltk_data"))
    os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")


def get_pdf_page_count(pdf_path: Path, timeout: int) -> int:
    result = run_command(["pdfinfo", str(pdf_path)], timeout=timeout)
    match = re.search(r"^Pages:\s+(\d+)", result.stdout, re.MULTILINE)
    page_count = int(match.group(1)) if match else 0

    if page_count <= 0:
        raise ConversionError("无法读取 PDF 页数")

    return page_count


def render_page_images(request: Request, page_count: int) -> dict[int, Path]:
    page_images: dict[int, Path] = {}

    with tempfile.TemporaryDirectory(prefix="xueleai-page-render-", dir=str(request.asset_dir)) as render_dir_name:
        render_dir = Path(render_dir_name)
        output_prefix = render_dir / "page"
        run_command(
            [
                "pdftoppm",
                "-f",
                "1",
                "-l",
                str(page_count),
                "-png",
                "-scale-to-x",
                str(request.page_image_width),
                "-scale-to-y",
                "-1",
                str(request.pdf_path),
                str(output_prefix),
            ],
            timeout=request.subprocess_timeout,
        )

        rendered_images: dict[int, Path] = {}
        for image_path in render_dir.glob("page-*.png"):
            match = re.match(r"^page-(\d+)\.png$", image_path.name)
            if match:
                rendered_images[int(match.group(1))] = image_path

        for page in range(1, page_count + 1):
            image_name = page_image_name(page)
            image_path = request.asset_dir / image_name
            rendered_image = rendered_images.get(page)

            if rendered_image is None:
                raise ConversionError(f"第 {page} 页图片生成失败")

            image_path.unlink(missing_ok=True)
            shutil.move(str(rendered_image), str(image_path))

            if not image_path.is_file() or image_path.stat().st_size <= 0:
                raise ConversionError(f"第 {page} 页图片生成失败")
            page_images[page] = image_path

    return page_images


def run_mineru(request: Request, temp_dir: Path, page_count: int) -> tuple[dict[int, list[str]], int]:
    output_dir = temp_dir / "mineru"
    command = [
        tool_path("mineru"),
        "-p",
        str(request.pdf_path),
        "-o",
        str(output_dir),
        "-b",
        "pipeline",
        "-m",
        request.mineru_method,
        "-l",
        "ch",
        "-s",
        "0",
        "-e",
        str(page_count - 1),
        "-f",
        boolean_cli_value(should_enable_mineru_formula(request)),
        "-t",
        "true",
    ]
    mineru_api_url = os.getenv("TEXTBOOK_MARKDOWN_MINERU_API_URL", "").strip()
    if mineru_api_url:
        command.extend(["--api-url", mineru_api_url])

    run_command(command, timeout=request.subprocess_timeout)

    content_path = find_first(output_dir, "*_content_list_v2.json") or find_first(output_dir, "*_content_list.json")
    if not content_path:
        raise ConversionError("MinerU 未生成内容 JSON")

    content = json.loads(content_path.read_text(encoding="utf-8"))
    pages = render_mineru_content(content, content_path.parent, request)
    image_count = len(list((content_path.parent / "images").glob("*"))) if (content_path.parent / "images").is_dir() else 0
    return pages, image_count


def should_enable_mineru_formula(request: Request) -> bool:
    value = os.getenv("TEXTBOOK_MARKDOWN_MINERU_FORMULA", "true").strip().lower()

    if value in {"0", "false", "no", "off"}:
        return False

    if value == "auto":
        subject = request.subject
        formula_subjects = ("数学", "物理", "化学", "科学", "生物", "信息技术", "通用技术")
        return any(item in subject for item in formula_subjects)

    return True


def boolean_cli_value(value: bool) -> str:
    return "true" if value else "false"


def run_nougat(request: Request, temp_dir: Path, converted_page_count: int) -> dict[str, Any]:
    pages = min(converted_page_count, request.nougat_max_pages)
    if pages <= 0:
        return {"status": "SKIPPED", "reason": "未启用 Nougat 增强"}

    output_dir = temp_dir / "nougat"
    command = [
        sys.executable,
        "-c",
        NOUGAT_COMPAT_RUNNER,
        str(request.pdf_path),
        "--out",
        str(output_dir),
        "--pages",
        f"1-{pages}",
        "--markdown",
        "--recompute",
    ]

    try:
        run_command(command, timeout=request.subprocess_timeout)
    except Exception as error:
        return {"status": "FAILED", "reason": str(error)[:500]}

    output_file = find_first(output_dir, "*.mmd")
    if not output_file:
        return {"status": "FAILED", "reason": "Nougat 未生成 MMD 文件"}

    text = output_file.read_text(encoding="utf-8", errors="ignore").strip()
    quality = score_text_quality(text)
    hallucinated = is_likely_nougat_hallucination(text)

    if not text:
        return {"status": "REJECTED", "reason": "Nougat 输出为空"}

    if hallucinated or quality["chinese_ratio"] < 0.08:
        return {"status": "REJECTED", "reason": "Nougat 输出未通过中文教材质量门控"}

    return {"status": "MERGED", "pages": pages, "text": text[:6000]}


def build_pages_markdown(
    request: Request,
    mineru_pages: dict[int, list[str]],
    page_images: dict[int, Path],
    converted_page_count: int,
) -> tuple[list[str], list[int]]:
    paddle = PaddleFallback()
    pages: list[str] = []
    paddle_pages: list[int] = []

    for page in range(1, converted_page_count + 1):
        blocks = mineru_pages.get(page, [])
        text_for_quality = "\n".join(strip_markdown(block) for block in blocks)

        if should_use_paddle_fallback(text_for_quality):
            fallback_text = paddle.recognize(page_images[page])
            if fallback_text:
                blocks = [render_text_blocks(fallback_text)]
                paddle_pages.append(page)

        pages.append(render_page_markdown(request, page, blocks, page_images[page]))

    return pages, paddle_pages


def render_mineru_content(content: Any, content_root: Path, request: Request) -> dict[int, list[str]]:
    if is_v2_page_list(content):
        pages_source = content
    else:
        max_page_idx = max((int(item.get("page_idx", 0)) for item in content if isinstance(item, dict)), default=0)
        pages_source = [[] for _ in range(max_page_idx + 1)]
        for item in content:
            if isinstance(item, dict):
                pages_source[int(item.get("page_idx", 0))].append(item)

    pages: dict[int, list[str]] = {}

    for page_index, items in enumerate(pages_source):
        page_number = page_index + 1
        blocks: list[str] = []

        for item in items:
            block = render_mineru_item(item, content_root, request)
            if block:
                blocks.append(block)

        pages[page_number] = blocks

    return pages


def render_mineru_item(item: dict[str, Any], content_root: Path, request: Request) -> str:
    item_type = str(item.get("type") or "")
    content = item.get("content")

    if item_type in {"page_header", "page_footer", "header", "footer"}:
        return ""

    if item_type in {"title", "text"}:
        text = normalize_text(extract_content_text(content) or str(item.get("text") or ""))
        if not text:
            return ""
        level = int((content or {}).get("level") or item.get("text_level") or 3) if isinstance(content, dict) else 3
        level = min(max(level + 1, 2), 5)
        return f"{'#' * level} {escape_markdown_text(text)}"

    if item_type in {"paragraph", "index", "list"}:
        text = normalize_text(extract_content_text(content) or str(item.get("text") or ""))
        return render_text_blocks(text)

    if item_type == "image":
        source_path = extract_image_path(content) or str(item.get("img_path") or "")
        if not source_path:
            return ""
        image_url = copy_mineru_asset(source_path, content_root, request)
        return f"![教材插图]({image_url})" if image_url else ""

    if item_type in {"table", "table_body"}:
        text = normalize_text(extract_content_text(content) or str(item.get("text") or ""))
        if not text:
            return ""
        markdown_table = render_html_table(text)
        if markdown_table:
            return markdown_table
        return render_text_blocks(text)

    if "equation" in item_type or "formula" in item_type:
        text = normalize_text(extract_content_text(content) or str(item.get("text") or ""))
        return f"$$\n{text}\n$$" if text else ""

    text = normalize_text(extract_content_text(content) or str(item.get("text") or ""))
    return render_text_blocks(text)


def extract_content_text(value: Any) -> str:
    parts: list[str] = []

    def walk(node: Any) -> None:
        if node is None:
            return
        if isinstance(node, str):
            parts.append(node)
            return
        if isinstance(node, list):
            for child in node:
                walk(child)
            return
        if isinstance(node, dict):
            if "content" in node and isinstance(node["content"], str):
                parts.append(node["content"])
            for key in (
                "title_content",
                "paragraph_content",
                "page_header_content",
                "page_footer_content",
                "list_items",
                "item_content",
                "table_body",
                "html",
                "latex",
            ):
                if key in node:
                    walk(node[key])

    walk(value)
    return "\n".join(part for part in parts if part.strip())


def extract_image_path(value: Any) -> str:
    if not isinstance(value, dict):
        return ""

    image_source = value.get("image_source")
    if isinstance(image_source, dict):
        return str(image_source.get("path") or "")

    return ""


def copy_mineru_asset(source_path: str, content_root: Path, request: Request) -> str:
    source = (content_root / source_path).resolve()
    if not source.is_file():
        return ""

    suffix = source.suffix.lower() or ".png"
    digest_name = f"mineru-{source.stem[:48]}{suffix}"
    target = request.asset_dir / digest_name
    shutil.copy2(source, target)
    return f"{request.asset_base_url}/{digest_name}"


def render_textbook_markdown(
    request: Request,
    page_count: int,
    converted_page_count: int,
    page_markdown: list[str],
    mineru_asset_count: int,
    paddle_pages: list[int],
    nougat_result: dict[str, Any],
) -> str:
    page_note = (
        f"\n\n> 当前为样本转换，仅处理前 {converted_page_count} 页；完整 PDF 共 {page_count} 页。"
        if converted_page_count < page_count
        else ""
    )
    paddle_note = "无" if not paddle_pages else "第 " + "、".join(str(page) for page in paddle_pages) + " 页"
    nougat_label = nougat_result["status"]
    if nougat_result.get("reason"):
        nougat_label = f"{nougat_label}（{nougat_result['reason']}）"

    chunks = [
        f"# {escape_markdown_text(request.title)}",
        "",
        "| 字段 | 内容 |",
        "| --- | --- |",
        f"| 类型 | {education_type_label(request.education_type)} |",
        f"| 学科 | {escape_table_cell(request.subject)} |",
        f"| 版本 | {escape_table_cell(request.version)} |",
        f"| 年级 | {escape_table_cell(request.grade)} |",
        f"| 册数 | {volume_label(request.volume)} |",
        f"| 出版社 | {escape_table_cell(request.publisher or '未填写')} |",
        f"| PDF页数 | {page_count} |",
        f"| 转换器 | {ENGINE_VERSION} |",
        f"| MinerU抽取图片 | {mineru_asset_count} 张 |",
        f"| PaddleOCR兜底 | {paddle_note} |",
        f"| Nougat增强 | {escape_table_cell(nougat_label)} |",
        "",
        "> 本 Markdown 正文由本地 PDF 备份自动抽取生成。主路径使用 MinerU pipeline 中文 OCR，并保留页面原图；当页面结构化文本质量不足时，使用 PaddleOCR 兜底识别。Nougat 仅在质量门控通过时作为公式与复杂结构增强。"
        + page_note,
        "",
        "## 教材目录",
        "",
        *[f"- [第 {index + 1} 页](#第-{index + 1}-页)" for index in range(converted_page_count)],
        "",
    ]

    if nougat_result.get("status") == "MERGED":
        chunks.extend(
            [
                "## Nougat 公式与结构增强",
                "",
                str(nougat_result.get("text", "")).strip(),
                "",
            ]
        )

    chunks.extend(page_markdown)
    return "\n".join(chunks).strip() + "\n"


class TableHtmlParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.rows: list[list[str]] = []
        self._current_row: list[str] | None = None
        self._current_cell: list[str] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "tr":
            self._current_row = []
        elif tag in {"td", "th"} and self._current_row is not None:
            self._current_cell = []

    def handle_data(self, data: str) -> None:
        if self._current_cell is not None:
            self._current_cell.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag in {"td", "th"} and self._current_row is not None and self._current_cell is not None:
            self._current_row.append(normalize_text(unescape("".join(self._current_cell))))
            self._current_cell = None
        elif tag == "tr" and self._current_row is not None:
            if any(cell for cell in self._current_row):
                self.rows.append(self._current_row)
            self._current_row = None


def render_html_table(value: str) -> str:
    if "<table" not in value.lower():
        return ""

    parser = TableHtmlParser()
    parser.feed(unescape(value))
    rows = [[escape_table_cell(cell) for cell in row] for row in parser.rows if row]

    if not rows:
        return ""

    width = max(len(row) for row in rows)
    normalized_rows = [row + [""] * (width - len(row)) for row in rows]
    header = normalized_rows[0]
    body = normalized_rows[1:]

    return "\n".join(
        [
            f"| {' | '.join(header)} |",
            f"| {' | '.join(['---'] * width)} |",
            *[f"| {' | '.join(row)} |" for row in body],
        ]
    )


def render_page_markdown(request: Request, page: int, blocks: list[str], image_path: Path) -> str:
    body = "\n\n".join(block for block in blocks if block.strip()).strip()
    image_url = f"{request.asset_base_url}/{image_path.name}"
    return "\n".join(
        [
            "---",
            "",
            f"## 第 {page} 页",
            "",
            body or "> 本页未抽取到可编辑文本，请参考下方页面图片。",
            "",
            f"![第 {page} 页原版页面图]({image_url})",
            "",
        ]
    )


def render_text_blocks(text: str) -> str:
    lines = [normalize_text(line) for line in text.splitlines()]
    lines = [line for line in lines if line]
    if not lines:
        return ""
    return "\n".join(escape_markdown_text(line) for line in lines)


def should_use_paddle_fallback(text: str) -> bool:
    quality = score_text_quality(text)
    if quality["length"] < 12:
        return True
    if quality["garbled_ratio"] > 0.18:
        return True
    if quality["chinese_count"] < 6 and quality["formula_count"] < 4:
        return True
    return False


def score_text_quality(text: str) -> dict[str, float]:
    compact = re.sub(r"\s+", "", text)
    length = len(compact)
    if length == 0:
        return {
            "length": 0,
            "chinese_count": 0,
            "formula_count": 0,
            "chinese_ratio": 0,
            "garbled_ratio": 1,
        }

    chinese_count = len(re.findall(r"[\u4e00-\u9fff]", compact))
    formula_count = len(re.findall(r"[=+\-*/^√×÷≤≥π∑]", compact))
    garbled_count = len(re.findall(r"[█�□■●◆◇◌]", compact))
    return {
        "length": length,
        "chinese_count": chinese_count,
        "formula_count": formula_count,
        "chinese_ratio": chinese_count / length,
        "garbled_ratio": garbled_count / length,
    }


def is_likely_nougat_hallucination(text: str) -> bool:
    lower = text.lower()
    bad_markers = [
        "journal of physics",
        "condensed matter",
        "j.-p. chen",
        "references",
    ]
    if any(marker in lower for marker in bad_markers):
        return True
    if len(re.findall(r"\[\d+\]", text)) >= 8 and len(re.findall(r"[\u4e00-\u9fff]", text)) < 20:
        return True
    return False


def strip_markdown(value: str) -> str:
    return re.sub(r"!\[[^\]]*]\([^)]+\)", "", value).replace("#", "")


def normalize_text(value: str) -> str:
    return re.sub(r"[ \t]+", " ", value.replace("\r\n", "\n").replace("\r", "\n")).strip()


def escape_markdown_text(value: str) -> str:
    return value.replace("\\", "\\\\").replace("<", "&lt;").replace(">", "&gt;")


def escape_table_cell(value: str) -> str:
    return normalize_text(value).replace("|", "\\|").replace("\n", " ")


def education_type_label(value: str) -> str:
    labels = {
        "JUNIOR": "初中",
        "JUNIOR_FIVE_FOUR": "初中五四学制",
        "PRIMARY": "小学",
        "PRIMARY_FIVE_FOUR": "小学五四学制",
        "SENIOR": "高中",
        "SPECIAL_EDUCATION": "特殊教育",
    }
    return labels.get(value, value)


def volume_label(value: str) -> str:
    labels = {
        "FIRST_VOLUME": "上册",
        "FULL_VOLUME": "全一册",
        "SECOND_VOLUME": "下册",
    }
    return labels.get(value, value)


def page_image_name(page: int) -> str:
    return f"page-{page:03d}.png"


def is_v2_page_list(content: Any) -> bool:
    return isinstance(content, list) and all(isinstance(page, list) for page in content)


def find_first(root: Path, pattern: str) -> Path | None:
    matches = sorted(root.rglob(pattern))
    return matches[0] if matches else None


def tool_path(name: str) -> str:
    for directory in (Path(sys.prefix) / "bin", Path(sys.executable).parent, Path(sys.executable).resolve().parent):
        candidate = directory / name
        if candidate.is_file():
            return str(candidate)

    resolved = shutil.which(name)
    return resolved or name


def run_command(command: list[str], timeout: int) -> subprocess.CompletedProcess[str]:
    try:
        result = subprocess.run(
            command,
            check=True,
            capture_output=True,
            text=True,
            timeout=timeout,
            env=os.environ.copy(),
        )
    except subprocess.TimeoutExpired as error:
        raise ConversionError(f"命令超时：{' '.join(command[:2])}") from error
    except subprocess.CalledProcessError as error:
        stderr = (error.stderr or error.stdout or "").strip()
        raise ConversionError(f"命令执行失败：{' '.join(command[:2])} {stderr[-1000:]}") from error

    return result


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        raise
