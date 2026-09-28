import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { AdminAuthModule } from "../admin-auth/admin-auth.module.js";
import { MembershipService } from "./membership.service.js";
import { MembershipController, AdminMembershipController } from "./membership.controller.js";
@Module({imports:[AuthModule,AdminAuthModule],controllers:[MembershipController,AdminMembershipController],providers:[MembershipService],exports:[MembershipService]})
export class MembershipModule {}
