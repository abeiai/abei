import { Body, Controller, Header, Inject, Post, Req, Res } from "@nestjs/common";
import { AuthService } from "../auth/auth.service.js";
import { successResponse } from "../common/api-response.js";
import { CopybookFontsService } from "../copybook-fonts/copybook-fonts.service.js";
import { ProfileContextService } from "../profiles/profile-context.service.js";
import { CreateCopybookLayoutDto, RenderLayoutDto } from "./dto/render-layout.dto.js";
import { RenderEngineService } from "./render-engine.service.js";

interface BinaryResponse {
  setHeader(name: string, value: string | number): void;
  send(body: Buffer): void;
}

@Controller("render")
export class RenderEngineController {
  constructor(
    @Inject(RenderEngineService) private readonly renderEngineService: RenderEngineService,
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(CopybookFontsService) private readonly copybookFontsService: CopybookFontsService,
    @Inject(ProfileContextService) private readonly profileContextService: ProfileContextService
  ) {}

  @Post("svg")
  @Header("Cache-Control", "no-store")
  async renderSvg(@Body() dto: RenderLayoutDto, @Req() request: unknown) {
    const user = await this.requireAccount(request);

    await this.copybookFontsService.assertLayoutFontAccess(dto.layout, user.id);

    return successResponse(this.renderEngineService.renderSvg(dto.layout));
  }

  @Post("pdf")
  async renderPdf(@Body() dto: RenderLayoutDto, @Req() request: unknown, @Res() response: BinaryResponse) {
    const user = await this.requireAccount(request);

    await this.copybookFontsService.assertLayoutFontAccess(dto.layout, user.id);

    const pdf = await this.renderEngineService.renderPdf(dto.layout);

    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", 'attachment; filename="zitie.pdf"');
    response.setHeader("Content-Length", pdf.length);
    response.send(pdf);
  }

  @Post("layout")
  @Header("Cache-Control", "no-store")
  async createLayout(@Body() dto: CreateCopybookLayoutDto, @Req() request: unknown) {
    await this.requireAccount(request);
    return successResponse(this.renderEngineService.createLayout(dto));
  }

  private async requireAccount(request: unknown) {
    const user = await this.authService.me(request as never);
    await this.profileContextService.requireAccount(request as never, user.id);
    return user;
  }
}
