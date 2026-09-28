import { Body, Controller, Get, Inject, Param, Post, Query, Req } from "@nestjs/common";
import { IsDateString, MaxLength, MinLength } from "class-validator";
import { AdminAuthService } from "../admin-auth/admin-auth.service.js";
import { successResponse } from "../common/api-response.js";
import { writeAdminOperationLog } from "../security/admin-operation-log.js";
import type { HeaderRequestLike } from "../security/request-types.js";
import { CourseReviewService } from "./course-review.service.js";

export class ApproveCourseReviewDto {
  @IsDateString({}, { message: "审核版本参数格式错误" })
  expectedUpdatedAt!: string;
}

export class RejectCourseReviewDto extends ApproveCourseReviewDto {
  @MinLength(2, { message: "拒绝原因至少需要 2 个字符" })
  @MaxLength(500, { message: "拒绝原因不能超过 500 个字符" })
  reason!: string;
}

@Controller("admin/course-reviews")
export class AdminCourseReviewsController {
  private readonly writeOperationLog = writeAdminOperationLog;

  constructor(
    @Inject(CourseReviewService) private readonly courseReviewService: CourseReviewService,
    @Inject(AdminAuthService) private readonly adminAuthService: AdminAuthService
  ) {}

  @Get()
  async list(
    @Req() request: unknown,
    @Query("scope") scope?: string,
    @Query("status") status?: string
  ) {
    await this.adminAuthService.me(request as never);

    return successResponse(await this.courseReviewService.listReviews({ scope, status }));
  }

  @Get(":id")
  async get(@Req() request: unknown, @Param("id") id: string) {
    await this.adminAuthService.me(request as never);

    return successResponse(await this.courseReviewService.getReview(id));
  }

  @Post(":id/ai-precheck")
  async runAiPrecheck(@Req() request: unknown, @Param("id") id: string) {
    const admin = await this.adminAuthService.me(request as never);
    const review = await this.courseReviewService.runAiPrecheck(id, "MANUAL", false);

    await this.writeOperationLog({
      adminUserId: admin.id,
      action: "RUN_RESOURCE_AI_PRECHECK",
      resourceType: "COURSE_REVIEW_REQUEST",
      resourceId: id,
      description: `手动执行资源 AI 预审：${aiPrecheckStatusLabel(review.aiPrecheckStatus)}`,
      request: request as HeaderRequestLike
    });

    return successResponse(review);
  }

  @Post(":id/approve")
  async approve(
    @Req() request: unknown,
    @Param("id") id: string,
    @Body() dto: ApproveCourseReviewDto
  ) {
    const admin = await this.adminAuthService.me(request as never);
    const review = await this.courseReviewService.approve(admin.id, id, dto.expectedUpdatedAt);

    await this.writeOperationLog({
      adminUserId: admin.id,
      action: "APPROVE_COURSE_REVIEW",
      resourceType: "COURSE_REVIEW_REQUEST",
      resourceId: id,
      description: "通过资源发布审核",
      request: request as HeaderRequestLike
    });

    return successResponse(review);
  }

  @Post(":id/reject")
  async reject(
    @Req() request: unknown,
    @Param("id") id: string,
    @Body() dto: RejectCourseReviewDto
  ) {
    const admin = await this.adminAuthService.me(request as never);
    const review = await this.courseReviewService.reject(
      admin.id,
      id,
      dto.reason,
      dto.expectedUpdatedAt
    );

    await this.writeOperationLog({
      adminUserId: admin.id,
      action: "REJECT_COURSE_REVIEW",
      resourceType: "COURSE_REVIEW_REQUEST",
      resourceId: id,
      description: `拒绝资源发布审核：${dto.reason.trim()}`,
      request: request as HeaderRequestLike
    });

    return successResponse(review);
  }
}

function aiPrecheckStatusLabel(status: string) {
  return {
    NOT_STARTED: "未开始",
    RUNNING: "已启动",
    PASSED: "已通过",
    REJECTED: "未通过",
    FAILED: "执行失败"
  }[status] ?? "状态未知";
}
