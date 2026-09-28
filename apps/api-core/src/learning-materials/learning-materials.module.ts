import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module.js";
import { LearningMaterialsController } from "./learning-materials.controller.js";
import { LearningMaterialsService } from "./learning-materials.service.js";
import { PublicLearningMaterialsController } from "./public-learning-materials.controller.js";

@Module({
  imports: [AdminAuthModule],
  controllers: [LearningMaterialsController, PublicLearningMaterialsController],
  providers: [LearningMaterialsService]
})
export class LearningMaterialsModule {}
