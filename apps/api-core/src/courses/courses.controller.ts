import {
  Body,
  Controller,
  Get,
  Header,
  HttpStatus,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { AdminAuthService } from "../admin-auth/admin-auth.service.js";
import { AuthService } from "../auth/auth.service.js";
import { successResponse } from "../common/api-response.js";
import { AppException } from "../common/app-exception.js";
import { MediaService, type UploadedFileLike } from "../media/media.service.js";
import { ProfileContextService } from "../profiles/profile-context.service.js";
import type { ProfileSubject } from "../profiles/profile-context.types.js";
import { CourseReviewService } from "./course-review.service.js";
import { CoursesService } from "./courses.service.js";
import {
  CourseCatalogQueryDto,
  CoursePageQueryDto,
  EnrollCoursesDto,
  SaveCourseDto
} from "./dto/course.dto.js";

@Controller("courses")
export class CoursesController {
  @Inject(CourseReviewService)
  private readonly courseReviewService!: CourseReviewService;

  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(CoursesService) private readonly coursesService: CoursesService,
    @Inject(MediaService) private readonly mediaService: MediaService,
    @Inject(ProfileContextService) private readonly profileContextService: ProfileContextService
  ) {}

  @Get("material-options")
  async materialOptions(@Req() request: unknown) {
    const user = await this.requireAccount(request);

    return successResponse(await this.coursesService.listMaterialOptions(user.id));
  }

  @Post("cover")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: {
        fileSize: 10 * 1024 * 1024
      }
    })
  )
  async uploadCover(@Req() request: unknown, @UploadedFile() file?: UploadedFileLike) {
    const user = await this.requireAccount(request);

    return successResponse(await this.mediaService.uploadUserCourseCover(user.id, file));
  }

  @Get()
  async list(@Req() request: unknown) {
    const user = await this.requireAccount(request);

    return successResponse(await this.coursesService.listUserCourses(user.id));
  }

  @Get("enrolled")
  async enrolled(@Req() request: unknown, @Query() query: CoursePageQueryDto) {
    const user = await this.requireAccount(request);

    return successResponse(await this.coursesService.listEnrolledCourses(user.id, query));
  }

  @Get("catalog")
  async catalog(@Req() request: unknown, @Query() query: CourseCatalogQueryDto) {
    const user = await this.requireAccount(request);

    return successResponse(await this.coursesService.listAvailableCourseCatalog(user.id, {
      ...query,
      includeTags: query.includeTags !== "false"
    }));
  }

  @Post("enrolled")
  async enroll(@Req() request: unknown, @Body() dto: EnrollCoursesDto) {
    const user = await this.requireAccount(request);

    return successResponse(await this.coursesService.enrollCourses(user.id, dto.courseIds));
  }

  @Post()
  async create(@Req() request: unknown, @Body() dto: SaveCourseDto) {
    const user = await this.requireAccount(request);

    return successResponse(await this.coursesService.createCourse(user.id, dto));
  }

  @Get(":id")
  async get(@Req() request: unknown, @Param("id") id: string) {
    const user = await this.requireAccount(request);

    return successResponse(await this.coursesService.getUserCourse(user.id, id));
  }

  @Put(":id")
  async save(@Req() request: unknown, @Param("id") id: string, @Body() dto: SaveCourseDto) {
    const user = await this.requireAccount(request);

    return successResponse(await this.coursesService.saveCourse(user.id, id, dto));
  }

  @Post(":id/submit")
  async submit(@Req() request: unknown, @Param("id") id: string) {
    const user = await this.requireAccount(request);

    return successResponse(await this.courseReviewService.submitCourse(user.id, id));
  }

  private async requireAccount(request: unknown) {
    const user = await this.authService.me(request as never);
    await this.profileContextService.requireAccount(request as never, user.id);
    return user;
  }
}

@Controller("public/courses")
export class PublicCoursesController {
  constructor(
    @Inject(CoursesService) private readonly coursesService: CoursesService,
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(ProfileContextService) private readonly profileContextService: ProfileContextService,
    @Inject(AdminAuthService) private readonly adminAuthService: AdminAuthService
  ) {}

  @Get()
  async list(@Req() request: unknown, @Query("view") view?: string) {
    const subject = await this.optionalSubject(request);
    const courses = view === "listing"
      ? await this.coursesService.listPublicCourseListing(subject)
      : await this.coursesService.listPublicCourses(subject);

    return successResponse(courses);
  }

  @Get(":id")
  @Header("Vary", "Cookie")
  @Header("Cache-Control", "private, no-store")
  async get(@Req() request: unknown, @Param("id") id: string) {
    const [userId, admin] = await Promise.all([
      this.optionalAccountUserId(request),
      this.optionalIdentity(() => this.adminAuthService.me(request as never))
    ]);

    return successResponse(await this.coursesService.getCoursePage(id, {
      userId,
      isAdmin: Boolean(admin)
    }));
  }

  private async optionalAccountUserId(request: unknown): Promise<string | null> {
    return this.optionalIdentity(async () => {
      const user = await this.authService.me(request as never);
      const context = await this.profileContextService.optional(request as never, user.id);

      return context?.mode === "ACCOUNT" ? user.id : null;
    });
  }

  private async optionalIdentity<T>(reader: () => Promise<T>): Promise<T | null> {
    try {
      return await reader();
    } catch (error) {
      if (error instanceof AppException && error.getStatus() === HttpStatus.UNAUTHORIZED) {
        return null;
      }

      throw error;
    }
  }

  private async optionalSubject(request: unknown): Promise<ProfileSubject | null> {
    try {
      const user = await this.authService.me(request as never);
      const context = await this.profileContextService.optional(request as never, user.id);
      return context?.mode === "LEARNER"
        ? { userId: user.id, mode: "LEARNER", learnerId: context.learnerId }
        : context?.mode === "ACCOUNT"
          ? { userId: user.id, mode: "ACCOUNT", learnerId: null }
          : null;
    } catch (error) {
      if (error instanceof AppException && error.code === 40101 && error.message === "请先登录") {
        return null;
      }
      throw error;
    }
  }
}
