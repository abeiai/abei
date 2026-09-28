import { Controller, Get, Inject, Query } from "@nestjs/common";
import { successResponse } from "../common/api-response.js";
import { DictionaryService } from "./dictionary.service.js";

@Controller("public/dict")
export class DictionaryController {
  constructor(@Inject(DictionaryService) private readonly dictionaryService: DictionaryService) {}

  @Get("search")
  async search(@Query() query: Record<string, string | undefined>) {
    return successResponse(await this.dictionaryService.search(query));
  }
}
