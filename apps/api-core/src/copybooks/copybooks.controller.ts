import { Body, Controller, Delete, Get, Inject, Param, Post, Query, Req, Res } from "@nestjs/common";
import { AuthService } from "../auth/auth.service.js";
import { successResponse } from "../common/api-response.js";
import { CopybookFontsService } from "../copybook-fonts/copybook-fonts.service.js";
import { LearnerAccessService } from "../profiles/learner-access.service.js";
import { ProfileContextService } from "../profiles/profile-context.service.js";
import { CopybooksService } from "./copybooks.service.js";
import { GenerateCopybookDto } from "./dto/copybook.dto.js";

interface BinaryResponse {
  setHeader(name: string, value: string | number): void;
  send(body: Buffer): void;
}

@Controller("copybooks")
export class CopybooksController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(CopybookFontsService) private readonly copybookFontsService: CopybookFontsService,
    @Inject(CopybooksService) private readonly copybooksService: CopybooksService,
    @Inject(ProfileContextService) private readonly profileContextService: ProfileContextService,
    @Inject(LearnerAccessService) private readonly learnerAccessService: LearnerAccessService
  ) {}

  @Post("generate")
  async generate(@Req() request: unknown, @Body() dto: GenerateCopybookDto) {
    const subject = await this.requireAccount(request);

    await this.learnerAccessService.assertScenarioAuthorized(subject, "zitie");
    await this.copybookFontsService.assertLayoutFontAccess(dto.layout, subject.userId);

    return successResponse(await this.copybooksService.generate(subject, dto));
  }

  @Get()
  async list(@Req() request: unknown) {
    const subject = await this.requireAccount(request);

    return successResponse(await this.copybooksService.list(subject));
  }

  @Get(":id/source")
  async source(@Req() request: unknown, @Param("id") id: string) {
    const subject = await this.requireAccount(request);

    return successResponse(await this.copybooksService.source(subject, id));
  }

  @Delete(":id")
  async delete(@Req() request: unknown, @Param("id") id: string) {
    const subject = await this.requireAccount(request);

    return successResponse(await this.copybooksService.delete(subject, id));
  }

  @Get(":id/pdf")
  async pdf(
    @Req() request: unknown,
    @Param("id") id: string,
    @Query("download") download: string | undefined,
    @Res() response: BinaryResponse
  ) {
    const subject = await this.requireAccount(request);
    const pdf = await this.copybooksService.pdf(subject, id);
    const disposition = download === "1" ? "attachment" : "inline";

    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", `${disposition}; filename="${pdf.filename}"`);
    response.setHeader("Content-Length", pdf.buffer.length);
    response.send(pdf.buffer);
  }

  private async requireAccount(request: unknown) {
    const user = await this.authService.me(request as never);
    return this.profileContextService.requireAccount(request as never, user.id);
  }
}
