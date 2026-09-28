import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UploadedFiles,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor, FilesInterceptor } from "@nestjs/platform-express";
import type { UploadedAudioFileLike } from "../audio/audio.service.js";
import { AuthService } from "../auth/auth.service.js";
import { successResponse } from "../common/api-response.js";
import { LearnerAccessService } from "../profiles/learner-access.service.js";
import { ProfileContextService } from "../profiles/profile-context.service.js";
import type { ProfileSubject } from "../profiles/profile-context.types.js";
import {
  englishGuidedStudyReadAlongUploadMaxBytes,
  ExtractEnglishGuidedStudyImageDto,
  EstimateEnglishGuidedStudyReadAlongUploadDto,
  GenerateEnglishGuidedStudyAudioDto,
  GenerateEnglishGuidedStudyMaterialDto,
  GenerateEnglishGuidedStudyPracticeDto,
  SubmitEnglishGuidedStudyReadAlongUploadDto,
  UpdateEnglishGuidedStudySourceDto,
  UpdateEnglishGuidedStudyScriptDto
} from "./dto/english-guided-study.dto.js";
import {
  englishGuidedStudyReferenceDocumentMaxBytes,
  englishGuidedStudyReferenceDocumentMaxCount,
  readingGuideDocumentMaxBytes,
  type EnglishGuidedStudyReferenceUploadedFile
} from "./english-guided-study-reference-materials.js";
import { EnglishGuidedStudyService } from "./english-guided-study.service.js";

@Controller("english-guided-study")
export class EnglishGuidedStudyController {
  constructor(
    @Inject(EnglishGuidedStudyService) private readonly englishGuidedStudyService: EnglishGuidedStudyService,
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(ProfileContextService) private readonly profileContextService: ProfileContextService,
    @Inject(LearnerAccessService) private readonly learnerAccessService: LearnerAccessService
  ) {}

  @Get("materials")
  async listMaterials(
    @Req() request: unknown,
    @Query("scene") scene?: "ENGLISH" | "GUSHIWEN" | "DAODU"
  ) {
    return this.authorized(request, async (_userId, subject) =>
      successResponse(await this.englishGuidedStudyService.listUserMaterials(subject, scene)),
      guidedStudyRootSlug(scene));
  }

  @Get("materials/history")
  async listMaterialHistory(
    @Req() request: unknown,
    @Query("scene") scene?: "ENGLISH" | "GUSHIWEN" | "DAODU",
    @Query("page") page?: string,
    @Query("search") search?: string
  ) {
    return this.authorized(request, async (_userId, subject) =>
      successResponse(await this.englishGuidedStudyService.listUserMaterialHistory(
        subject,
        scene ?? "ENGLISH",
        { page, search }
      )),
      guidedStudyRootSlug(scene));
  }

  @Post("materials/generate")
  async generateMaterial(@Req() request: unknown, @Body() dto: GenerateEnglishGuidedStudyMaterialDto) {
    return this.authorized(request, async (_userId, subject) =>
      successResponse(await this.englishGuidedStudyService.submitMaterialGeneration(subject, dto)),
      guidedStudyRootSlug(dto.scene));
  }

  @Post("materials/generate/estimate")
  async estimateMaterialGeneration(
    @Req() request: unknown,
    @Body() dto: GenerateEnglishGuidedStudyMaterialDto
  ) {
    return this.authorized(
      request,
      async (userId) => successResponse(await this.englishGuidedStudyService.estimateMaterialGeneration(userId, dto)),
      guidedStudyRootSlug(dto.scene)
    );
  }

  @Post("images/extract")
  async extractImage(@Req() request: unknown, @Body() dto: ExtractEnglishGuidedStudyImageDto) {
    return this.authorized(
      request,
      async (_userId, _subject, attribution) =>
        successResponse(await this.englishGuidedStudyService.extractImageText(attribution, dto)),
      guidedStudyRootSlug(dto.scene)
    );
  }

  @Post("references/extract")
  @UseInterceptors(
    FilesInterceptor("files", englishGuidedStudyReferenceDocumentMaxCount, {
      limits: {
        fileSize: englishGuidedStudyReferenceDocumentMaxBytes,
        files: englishGuidedStudyReferenceDocumentMaxCount
      }
    })
  )
  async extractReferenceDocuments(
    @Req() request: unknown,
    @Query("scene") scene: "ENGLISH" | "GUSHIWEN" | "DAODU" | undefined,
    @UploadedFiles() files?: EnglishGuidedStudyReferenceUploadedFile[]
  ) {
    return this.authorized(
      request,
      async (userId) => successResponse(
        await this.englishGuidedStudyService.extractReferenceDocuments(userId, files)),
      guidedStudyRootSlug(scene)
    );
  }

  @Post("documents/extract")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: readingGuideDocumentMaxBytes }
    })
  )
  async extractReadingGuideDocument(
    @Req() request: unknown,
    @UploadedFile() file?: EnglishGuidedStudyReferenceUploadedFile
  ) {
    return this.authorized(
      request,
      async (userId) => successResponse(
        await this.englishGuidedStudyService.extractReadingGuideDocument(userId, file)),
      "daodu"
    );
  }

  @Get("materials/:id")
  async getMaterial(@Req() request: unknown, @Param("id") id: string) {
    return this.authorized(request, async (_userId, subject) =>
      successResponse(await this.englishGuidedStudyService.getUserMaterial(subject, id)),
      (subject) => this.englishGuidedStudyService.getMaterialAuthorizationRoot(subject, id));
  }

  @Patch("materials/:id/pin")
  async pinMaterial(@Req() request: unknown, @Param("id") id: string) {
    return this.authorized(request, async (_userId, subject) =>
      successResponse(await this.englishGuidedStudyService.pinMaterial(subject, id)),
      (subject) => this.englishGuidedStudyService.getMaterialAuthorizationRoot(subject, id));
  }

  @Delete("materials/:id")
  async deleteMaterial(@Req() request: unknown, @Param("id") id: string) {
    return this.authorized(request, async (_userId, subject) =>
      successResponse(await this.englishGuidedStudyService.deleteMaterial(subject, id)),
      (subject) => this.englishGuidedStudyService.getMaterialAuthorizationRoot(subject, id));
  }

  @Patch("materials/:id/script")
  async updateMaterialScript(
    @Req() request: unknown,
    @Param("id") id: string,
    @Body() dto: UpdateEnglishGuidedStudyScriptDto
  ) {
    return this.authorized(request, async (_userId, subject) =>
      successResponse(await this.englishGuidedStudyService.updateMaterialScript(subject, id, dto)),
      (subject) => this.englishGuidedStudyService.getMaterialAuthorizationRoot(subject, id));
  }

  @Post("materials/:id/script/estimate")
  async estimateMaterialScriptUpdate(
    @Req() request: unknown,
    @Param("id") id: string,
    @Body() dto: UpdateEnglishGuidedStudyScriptDto
  ) {
    return this.authorized(request, async (_userId, subject) =>
      successResponse(await this.englishGuidedStudyService.estimateMaterialScriptUpdate(subject, id, dto)),
      (subject) => this.englishGuidedStudyService.getMaterialAuthorizationRoot(subject, id));
  }

  @Patch("materials/:id/source")
  async updateMaterialSource(
    @Req() request: unknown,
    @Param("id") id: string,
    @Body() dto: UpdateEnglishGuidedStudySourceDto
  ) {
    return this.authorized(
      request,
      async (_userId, subject) => successResponse(
        await this.englishGuidedStudyService.updateMaterialSource(subject, id, dto)),
      (subject) => this.englishGuidedStudyService.getMaterialAuthorizationRoot(subject, id)
    );
  }

  @Post("materials/:id/practice")
  async generateMaterialPractice(
    @Req() request: unknown,
    @Param("id") id: string,
    @Body() dto: GenerateEnglishGuidedStudyPracticeDto
  ) {
    return this.authorized(request, async (_userId, subject) => successResponse(
      await this.englishGuidedStudyService.submitMaterialPracticeGeneration(subject, id, dto)),
      (subject) => this.englishGuidedStudyService.getMaterialAuthorizationRoot(subject, id));
  }

  @Post("materials/:id/audio")
  async generateMaterialAudio(
    @Req() request: unknown,
    @Param("id") id: string,
    @Body() dto: GenerateEnglishGuidedStudyAudioDto
  ) {
    return this.authorized(request, async (_userId, subject) =>
      successResponse(await this.englishGuidedStudyService.submitMaterialAudioGeneration(subject, id, dto)),
      (subject) => this.englishGuidedStudyService.getMaterialAuthorizationRoot(subject, id));
  }

  @Post("materials/:id/audio/estimate")
  async estimateMaterialAudioGeneration(
    @Req() request: unknown,
    @Param("id") id: string,
    @Body() dto: GenerateEnglishGuidedStudyAudioDto
  ) {
    return this.authorized(request, async (_userId, subject) => successResponse(
      await this.englishGuidedStudyService.estimateMaterialAudioGeneration(subject, id, dto)),
      (subject) => this.englishGuidedStudyService.getMaterialAuthorizationRoot(subject, id));
  }

  @Post("materials/:id/read-along")
  async generateMaterialReadAlong(
    @Req() request: unknown,
    @Param("id") id: string,
    @Body() dto: GenerateEnglishGuidedStudyAudioDto
  ) {
    return this.authorized(request, async (_userId, subject) => successResponse(
      await this.englishGuidedStudyService.submitMaterialReadAlongGeneration(subject, id, dto)),
      (subject) => this.englishGuidedStudyService.getMaterialAuthorizationRoot(subject, id));
  }

  @Post("materials/:id/read-along/estimate")
  async estimateMaterialReadAlong(
    @Req() request: unknown,
    @Param("id") id: string,
    @Body() dto: GenerateEnglishGuidedStudyAudioDto
  ) {
    return this.authorized(request, async (_userId, subject) => successResponse(
      await this.englishGuidedStudyService.estimateMaterialReadAlongGeneration(subject, id, dto)),
      (subject) => this.englishGuidedStudyService.getMaterialAuthorizationRoot(subject, id));
  }

  @Post("materials/:id/read-along/upload")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: {
        // Multer rejects at the limit; storage enforces the inclusive file-size cap.
        fileSize: englishGuidedStudyReadAlongUploadMaxBytes + 1
      }
    })
  )
  async uploadMaterialReadAlong(
    @Req() request: unknown,
    @Param("id") id: string,
    @UploadedFile() file: UploadedAudioFileLike | undefined,
    @Body() dto: SubmitEnglishGuidedStudyReadAlongUploadDto
  ) {
    return this.authorized(request, async (_userId, subject) => successResponse(
      await this.englishGuidedStudyService.submitMaterialReadAlongUpload(subject, id, file, dto)),
      (subject) => this.englishGuidedStudyService.getMaterialAuthorizationRoot(subject, id));
  }

  @Post("materials/:id/read-along/upload/estimate")
  async estimateMaterialReadAlongUpload(
    @Req() request: unknown,
    @Param("id") id: string,
    @Body() dto: EstimateEnglishGuidedStudyReadAlongUploadDto
  ) {
    return this.authorized(request, async (_userId, subject) => successResponse(
      await this.englishGuidedStudyService.estimateMaterialReadAlongUpload(subject, id, dto)),
      (subject) => this.englishGuidedStudyService.getMaterialAuthorizationRoot(subject, id));
  }

  private async authorized<T>(
    request: unknown,
    callback: (
      userId: string,
      subject: ProfileSubject,
      attribution: { userId: string; learnerId: string | null; rootScenarioId: string | null }
    ) => Promise<T>,
    rootSlug:
      | string
      | ((subject: ProfileSubject) => Promise<string>) = "english-guided-study-material"
  ) {
    const user = await this.authService.me(request as never);
    const subject = await this.profileContextService.requireSelected(request as never, user.id);
    const resolvedRootSlug = typeof rootSlug === "function" ? await rootSlug(subject) : rootSlug;
    const root = await this.learnerAccessService.assertScenarioAuthorized(subject, resolvedRootSlug);
    return this.learnerAccessService.runWithScenarioAuthorization(
      subject,
      root?.slug ?? resolvedRootSlug,
      () => callback(user.id, subject, {
        userId: subject.userId,
        learnerId: subject.learnerId,
        rootScenarioId: root?.id ?? null
      })
    );
  }
}

function guidedStudyRootSlug(scene: "ENGLISH" | "GUSHIWEN" | "DAODU" | undefined) {
  return scene === "DAODU"
    ? "daodu"
    : scene === "GUSHIWEN"
      ? "gushiwen-guided-study-material"
      : "english-guided-study-material";
}

@Controller("public/english-guided-study")
export class PublicEnglishGuidedStudyController {
  constructor(@Inject(EnglishGuidedStudyService) private readonly englishGuidedStudyService: EnglishGuidedStudyService) {}

  @Get("materials/:id")
  async getPublicMaterial(@Param("id") id: string) {
    return successResponse(await this.englishGuidedStudyService.getPublicMaterial(id));
  }
}
