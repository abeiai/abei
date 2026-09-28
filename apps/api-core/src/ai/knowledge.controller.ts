import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Req,
  UploadedFile,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { AuthService } from "../auth/auth.service.js";
import { successResponse } from "../common/api-response.js";
import { ProfileContextService } from "../profiles/profile-context.service.js";
import { AdvancedAiService } from "./advanced-ai.service.js";
import { CreateKnowledgeBaseDto, SearchKnowledgeDto } from "./dto/advanced-ai.dto.js";

interface UploadedFileLike {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Controller("knowledge-bases")
export class KnowledgeController {
  constructor(
    @Inject(AdvancedAiService) private readonly advancedAiService: AdvancedAiService,
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(ProfileContextService) private readonly profileContextService: ProfileContextService
  ) {}

  @Get()
  async list(@Req() request: unknown) {
    const user = await this.requireAccount(request);

    return successResponse(await this.advancedAiService.listKnowledgeBases(user.id));
  }

  @Post()
  async create(@Req() request: unknown, @Body() dto: CreateKnowledgeBaseDto) {
    const user = await this.requireAccount(request);

    return successResponse(await this.advancedAiService.createKnowledgeBase(user.id, dto));
  }

  @Get(":id")
  async detail(@Req() request: unknown, @Param("id") id: string) {
    const user = await this.requireAccount(request);

    return successResponse(await this.advancedAiService.getKnowledgeBase(user.id, id));
  }

  @Post(":id/documents")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: {
        fileSize: Number(process.env.KNOWLEDGE_UPLOAD_MAX_BYTES ?? 5 * 1024 * 1024)
      }
    })
  )
  async upload(
    @Req() request: unknown,
    @Param("id") id: string,
    @UploadedFile() file?: UploadedFileLike
  ) {
    const user = await this.requireAccount(request);

    return successResponse(await this.advancedAiService.uploadKnowledgeDocument(user.id, id, file));
  }

  @Post(":id/search")
  async search(@Req() request: unknown, @Param("id") id: string, @Body() dto: SearchKnowledgeDto) {
    const user = await this.requireAccount(request);

    return successResponse(await this.advancedAiService.searchKnowledgeBase(user.id, id, dto));
  }

  private async requireAccount(request: unknown) {
    const user = await this.authService.me(request as never);
    await this.profileContextService.requireAccount(request as never, user.id);
    return user;
  }
}
