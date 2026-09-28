import {
  Body,
  Controller,
  Get,
  Inject,
  Logger,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { AuthService } from "../auth/auth.service.js";
import { successResponse } from "../common/api-response.js";
import { AppException } from "../common/app-exception.js";
import { avatarUploadMaxBytes, MediaService, type UploadedFileLike } from "../media/media.service.js";
import { setProfileContextCookie, type ResponseLike } from "../security/cookies.js";
import {
  CreateLearnerDto,
  EnterLearnerDto,
  ReturnToAccountDto,
  SelectProfileDto,
  SwitchLearnerDto,
  UpdateLearnerAuthorizationsDto,
  UpdateCurrentLearnerDto,
  UpdateLearnerDto,
  UpdateSwitchPasswordDto
} from "./dto/profile.dto.js";
import { learnerGradeOptions } from "./learner-grade.js";
import { LearnerAccessService } from "./learner-access.service.js";
import { LearnerProfilesService } from "./learner-profiles.service.js";
import { ProfileContextService } from "./profile-context.service.js";

@Controller("profiles")
export class ProfilesController {
  private readonly logger = new Logger(ProfilesController.name);

  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(ProfileContextService) private readonly profileContextService: ProfileContextService,
    @Inject(LearnerProfilesService) private readonly learnerProfilesService: LearnerProfilesService,
    @Inject(LearnerAccessService) private readonly learnerAccessService: LearnerAccessService,
    @Inject(MediaService) private readonly mediaService: MediaService
  ) {}

  @Get("selection")
  async selection(@Req() request: unknown) {
    const user = await this.authService.me(request as never);
    return successResponse(await this.learnerProfilesService.selection(user));
  }

  @Post("select")
  async select(
    @Req() request: unknown,
    @Body() dto: SelectProfileDto,
    @Res({ passthrough: true }) response: unknown
  ) {
    const user = await this.authService.me(request as never);
    const transition = await this.profileContextService.select(request as never, user.id, dto);
    await this.authService.setProfileAccessCookie(user.id, transition.context.mode, response as ResponseLike);
    setProfileContextCookie(response as ResponseLike, transition);
    return successResponse(transition.context);
  }

  @Post("enter-learner")
  async enterLearner(
    @Req() request: unknown,
    @Body() dto: EnterLearnerDto,
    @Res({ passthrough: true }) response: unknown
  ) {
    const user = await this.authService.me(request as never);
    const transition = await this.profileContextService.enterLearner(request as never, user.id, dto);
    await this.authService.setProfileAccessCookie(user.id, transition.context.mode, response as ResponseLike);
    setProfileContextCookie(response as ResponseLike, transition);
    return successResponse(transition.context);
  }

  @Post("switch-learner")
  async switchLearner(
    @Req() request: unknown,
    @Body() dto: SwitchLearnerDto,
    @Res({ passthrough: true }) response: unknown
  ) {
    const user = await this.authService.me(request as never);
    const transition = await this.profileContextService.switchLearner(request as never, user.id, dto);
    await this.authService.setProfileAccessCookie(user.id, transition.context.mode, response as ResponseLike);
    setProfileContextCookie(response as ResponseLike, transition);
    return successResponse(transition.context);
  }

  @Post("return-account")
  async returnToAccount(
    @Req() request: unknown,
    @Body() dto: ReturnToAccountDto,
    @Res({ passthrough: true }) response: unknown
  ) {
    const user = await this.authService.me(request as never);
    const transition = await this.profileContextService.returnToAccount(request as never, user.id, dto);
    await this.authService.setProfileAccessCookie(user.id, transition.context.mode, response as ResponseLike);
    setProfileContextCookie(response as ResponseLike, transition);
    return successResponse(transition.context);
  }

  @Get("grades")
  async grades(@Req() request: unknown) {
    await this.requireAccount(request);
    return successResponse(learnerGradeOptions);
  }

  @Get("learners")
  async learners(@Req() request: unknown, @Query("status") status?: "ACTIVE" | "INACTIVE") {
    const user = await this.requireAccount(request);
    return successResponse(await this.learnerProfilesService.list(user.id, status));
  }

  @Post("learners")
  async createLearner(@Req() request: unknown, @Body() dto: CreateLearnerDto) {
    const user = await this.requireAccount(request);
    return successResponse(await this.learnerProfilesService.create(user.id, dto));
  }

  @Patch("learners/:id")
  async updateLearner(@Req() request: unknown, @Param("id") learnerId: string, @Body() dto: UpdateLearnerDto) {
    const user = await this.requireAccount(request);
    return successResponse(await this.learnerProfilesService.update(user.id, learnerId, dto));
  }

  @Post("learners/:id/deactivate")
  async deactivateLearner(@Req() request: unknown, @Param("id") learnerId: string) {
    const user = await this.requireAccount(request);
    return successResponse(await this.learnerProfilesService.deactivate(user.id, learnerId));
  }

  @Post("learners/:id/restore")
  async restoreLearner(@Req() request: unknown, @Param("id") learnerId: string) {
    const user = await this.requireAccount(request);
    return successResponse(await this.learnerProfilesService.restore(user.id, learnerId));
  }

  @Patch("learners/:id/avatar")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: avatarUploadMaxBytes() }
    })
  )
  async updateLearnerAvatar(
    @Req() request: unknown,
    @Param("id") learnerId: string,
    @UploadedFile() file?: UploadedFileLike
  ) {
    const user = await this.requireAccount(request);
    await this.learnerProfilesService.assertOwned(user.id, learnerId);
    const asset = await this.mediaService.uploadLearnerAvatar(user.id, file);

    try {
      return successResponse(await this.learnerProfilesService.updateAvatar(user.id, learnerId, asset.url));
    } catch (error) {
      try {
        const cleanup = await this.mediaService.cleanupLearnerAvatar(user.id, asset.id);

        if (!cleanup.deleted) {
          this.logger.warn(`学习者头像补偿未找到新资产：${asset.id}`);
        }
      } catch (cleanupError) {
        this.logger.error(
          `学习者头像补偿失败：${asset.id}`,
          cleanupError instanceof Error ? cleanupError.stack : String(cleanupError)
        );
      }

      throw error;
    }
  }

  @Get("authorization-options")
  async authorizationOptions(@Req() request: unknown) {
    await this.requireAccount(request);
    return successResponse(await this.learnerAccessService.listAuthorizationOptions());
  }

  @Get("learners/:id/authorizations")
  async learnerAuthorizations(@Req() request: unknown, @Param("id") learnerId: string) {
    const user = await this.requireAccount(request);
    return successResponse(await this.learnerAccessService.getAuthorizations(user.id, learnerId));
  }

  @Put("learners/:id/authorizations")
  async replaceLearnerAuthorizations(
    @Req() request: unknown,
    @Param("id") learnerId: string,
    @Body() dto: UpdateLearnerAuthorizationsDto
  ) {
    const user = await this.requireAccount(request);
    return successResponse(await this.learnerAccessService.replaceAuthorizations(user.id, learnerId, dto));
  }

  @Patch("switch-password")
  async updateSwitchPassword(@Req() request: unknown, @Body() dto: UpdateSwitchPasswordDto) {
    const user = await this.requireAccount(request);
    return successResponse(await this.learnerProfilesService.updateSwitchPassword(user.id, dto));
  }

  @Get("learner/courses")
  async learnerCourses(@Req() request: unknown) {
    const subject = await this.requireLearner(request);
    return successResponse(await this.learnerAccessService.listAuthorizedCourses(subject));
  }

  @Patch("learner/me")
  async updateCurrentLearner(@Req() request: unknown, @Body() dto: UpdateCurrentLearnerDto) {
    const subject = await this.requireLearner(request, "请使用学习者身份修改资料");
    return successResponse(
      await this.learnerProfilesService.update(subject.userId, subject.learnerId, {
        nickname: dto.nickname
      })
    );
  }

  @Patch("learner/me/avatar")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: avatarUploadMaxBytes() }
    })
  )
  async updateCurrentLearnerAvatar(
    @Req() request: unknown,
    @UploadedFile() file?: UploadedFileLike
  ) {
    const subject = await this.requireLearner(request, "请使用学习者身份修改资料");
    const asset = await this.mediaService.uploadLearnerAvatar(subject.userId, file);

    try {
      return successResponse(
        await this.learnerProfilesService.updateAvatar(subject.userId, subject.learnerId, asset.url)
      );
    } catch (error) {
      try {
        const cleanup = await this.mediaService.cleanupLearnerAvatar(subject.userId, asset.id);

        if (!cleanup.deleted) {
          this.logger.warn(`学习者头像补偿未找到新资产：${asset.id}`);
        }
      } catch (cleanupError) {
        this.logger.error(
          `学习者头像补偿失败：${asset.id}`,
          cleanupError instanceof Error ? cleanupError.stack : String(cleanupError)
        );
      }

      throw error;
    }
  }

  @Get("learner/courses/:id")
  async learnerCourse(@Req() request: unknown, @Param("id") id: string) {
    const subject = await this.requireLearner(request);
    return successResponse(await this.learnerAccessService.getAuthorizedCourse(subject, id));
  }

  @Get("learner/home")
  async learnerHome(@Req() request: unknown) {
    const subject = await this.requireLearner(request, "请使用学习者身份访问学习首页");
    return successResponse(await this.learnerAccessService.listAuthorizedHome(subject));
  }

  @Get("learner/statistics")
  async learnerStatistics(@Req() request: unknown) {
    const subject = await this.requireLearner(request, "请使用学习者身份查看学习统计");
    return successResponse(await this.learnerAccessService.listLearningStatistics(subject));
  }

  private async requireAccount(request: unknown) {
    const user = await this.authService.me(request as never);
    await this.profileContextService.requireAccount(request as never, user.id);
    return user;
  }

  private async requireLearner(request: unknown, errorMessage = "请使用学习者身份访问课程") {
    const user = await this.authService.me(request as never);
    const subject = await this.profileContextService.requireSelected(request as never, user.id);
    if (subject.mode !== "LEARNER") {
      throw new AppException(40301, errorMessage, 403);
    }
    return subject;
  }
}
