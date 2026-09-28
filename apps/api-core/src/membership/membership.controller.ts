import { Body, Controller, Get, Inject, Param, Post, Put, Req } from "@nestjs/common";
import { AuthService } from "../auth/auth.service.js";
import { AdminAuthService } from "../admin-auth/admin-auth.service.js";
import { successResponse } from "../common/api-response.js";
import { MembershipService } from "./membership.service.js";
@Controller("membership")
export class MembershipController {
 constructor(@Inject(MembershipService) private readonly service:MembershipService,@Inject(AuthService) private readonly auth:AuthService) {}
 @Get("plans") async plans(){return successResponse(await this.service.list());}
 @Get("me") async me(@Req() request:unknown){const user=await this.auth.me(request as never);return successResponse(await this.service.me(user.id));}
}
@Controller("admin/memberships")
export class AdminMembershipController {
 constructor(@Inject(MembershipService) private readonly service:MembershipService,@Inject(AdminAuthService) private readonly auth:AdminAuthService) {}
 @Get() async plans(@Req() request:unknown){await this.auth.me(request as never);return successResponse(await this.service.list(true));}
 @Get("settings") async settings(@Req() request:unknown){await this.auth.me(request as never);return successResponse(await this.service.settings());}
 @Put("settings") async saveSettings(@Req() request:unknown,@Body() body:unknown){await this.auth.me(request as never);return successResponse(await this.service.saveSettings(body));}
 @Post() async create(@Req() request:unknown,@Body() body:unknown){await this.auth.me(request as never);return successResponse(await this.service.save(body));}
 @Put(":id") async update(@Req() request:unknown,@Param("id") id:string,@Body() body:unknown){await this.auth.me(request as never);return successResponse(await this.service.save(body,id));}
}
