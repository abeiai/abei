import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { MediaModule } from "../media/media.module.js";
import { OrganizationsModule } from "../organizations/organizations.module.js";
import { ProfilesModule } from "../profiles/profiles.module.js";
import { AdvancedAiController } from "./advanced-ai.controller.js";
import { AdvancedAiService } from "./advanced-ai.service.js";
import { AdminAiModelAliasController } from "./admin-ai-model-alias.controller.js";
import { AdminAiProviderController } from "./admin-ai-provider.controller.js";
import { AdminAiProviderPresetController } from "./admin-ai-provider-preset.controller.js";
import { AdminAiScenarioController } from "./admin-ai-scenario.controller.js";
import { AdminAiTaskController } from "./admin-ai-task.controller.js";
import { AdminAiToolCategoryController } from "./admin-ai-tool-category.controller.js";
import { AdminAiToolTemplateController } from "./admin-ai-tool-template.controller.js";
import { AdminAiUsageController } from "./admin-ai-usage.controller.js";
import { AiController } from "./ai.controller.js";
import { AiUsageService } from "./ai-usage.service.js";
import { AiService } from "./ai.service.js";
import { KnowledgeController } from "./knowledge.controller.js";

@Module({
  imports: [AuthModule, AdminAuthModule, OrganizationsModule, ProfilesModule, MediaModule],
  controllers: [
    AiController,
    AdvancedAiController,
    KnowledgeController,
    AdminAiProviderController,
    AdminAiProviderPresetController,
    AdminAiModelAliasController,
    AdminAiScenarioController,
    AdminAiToolCategoryController,
    AdminAiToolTemplateController,
    AdminAiTaskController,
    AdminAiUsageController
  ],
  providers: [AiService, AdvancedAiService, AiUsageService],
  exports: [AiService]
})
export class AiModule {}
