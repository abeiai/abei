import { Controller, Get, Inject, Param } from "@nestjs/common";
import { successResponse } from "../common/api-response.js";
import { PageCompositionsService } from "../page-compositions/page-compositions.service.js";
import { PublicContentService } from "./public-content.service.js";

@Controller("public")
export class PublicContentController {
  constructor(
    @Inject(PublicContentService) private readonly publicContentService: PublicContentService,
    @Inject(PageCompositionsService) private readonly pageCompositionsService: PageCompositionsService
  ) {}

  @Get("articles")
  async listArticles() {
    return successResponse(await this.publicContentService.listArticles());
  }

  @Get("articles/:slug")
  async getArticle(@Param("slug") slug: string) {
    return successResponse(await this.publicContentService.getArticle(slug));
  }

  @Get("pages")
  async listPages() {
    return successResponse(await this.publicContentService.listPages());
  }

  @Get("pages/:slug")
  async getPage(@Param("slug") slug: string) {
    return successResponse(await this.publicContentService.getPage(slug));
  }

  @Get("modules")
  async listModules() {
    return successResponse(await this.publicContentService.listModules());
  }

  @Get("modules/:slug")
  async getModule(@Param("slug") slug: string) {
    return successResponse(await this.publicContentService.getModule(slug));
  }

  @Get("page-compositions/home")
  async getHomeComposition() {
    return successResponse(await this.pageCompositionsService.getActiveHomeComposition());
  }

  @Get("page-compositions/pages/:slug")
  async getPageComposition(@Param("slug") slug: string) {
    return successResponse(await this.pageCompositionsService.getActivePageComposition(slug));
  }
}
