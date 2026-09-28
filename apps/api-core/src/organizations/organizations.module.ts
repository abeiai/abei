import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { ProfilesModule } from "../profiles/profiles.module.js";
import { AdminOrganizationsController } from "./admin-organizations.controller.js";
import { OrganizationsController } from "./organizations.controller.js";
import { OrganizationsService } from "./organizations.service.js";

@Module({
  imports: [AuthModule, AdminAuthModule, ProfilesModule],
  controllers: [OrganizationsController, AdminOrganizationsController],
  providers: [OrganizationsService],
  exports: [OrganizationsService]
})
export class OrganizationsModule {}
