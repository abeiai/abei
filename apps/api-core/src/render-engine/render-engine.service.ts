import { HttpStatus, Injectable } from "@nestjs/common";
import { AppException } from "../common/app-exception.js";
import {
  createCopybookLayout,
  parseLayoutDocument,
  type CreateCopybookLayoutInput
} from "./core/layout-parser.js";
import { renderCopybookPdf } from "./pdf/pdf-renderer.js";
import { buildCopybookSvg } from "./svg/svg-builder.js";

@Injectable()
export class RenderEngineService {
  renderSvg(layout: unknown) {
    const document = parseLayoutDocument(layout);
    const svgs = document.pages.map((page) => buildCopybookSvg(page, { fontUrlMode: "preview" }));

    return {
      svg: svgs.join(""),
      svgs
    };
  }

  async renderPdf(layout: unknown) {
    const document = parseLayoutDocument(layout);

    try {
      return await renderCopybookPdf(document);
    } catch {
      throw new AppException(50001, "PDF 生成失败，请稍后再试", HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  createLayout(input: CreateCopybookLayoutInput) {
    return {
      layout: createCopybookLayout(input)
    };
  }
}
