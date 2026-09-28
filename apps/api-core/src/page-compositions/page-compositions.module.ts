import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module.js";
import { PageCompositionsController } from "./page-compositions.controller.js";
import { PageCompositionsService } from "./page-compositions.service.js";

@Module({
  imports: [AdminAuthModule],
  controllers: [PageCompositionsController],
  providers: [PageCompositionsService],
  exports: [PageCompositionsService]
})
export class PageCompositionsModule {}
