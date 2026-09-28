import { Module } from "@nestjs/common";
import { PageCompositionsModule } from "../page-compositions/page-compositions.module.js";
import { PublicContentController } from "./public-content.controller.js";
import { PublicContentService } from "./public-content.service.js";

@Module({
  imports: [PageCompositionsModule],
  controllers: [PublicContentController],
  providers: [PublicContentService]
})
export class PublicContentModule {}
