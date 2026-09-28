import { Controller, Get, Inject, Query, Req } from "@nestjs/common";
import { AuthService } from "../auth/auth.service.js";
import { successResponse } from "../common/api-response.js";
import { ProfileContextService } from "../profiles/profile-context.service.js";
import { WalletService } from "./wallet.service.js";

@Controller("wallet")
export class WalletController {
  constructor(
    @Inject(WalletService) private readonly walletService: WalletService,
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(ProfileContextService) private readonly profileContextService: ProfileContextService
  ) {}

  @Get("me")
  async me(@Req() request: unknown) {
    const user = await this.authService.me(request as never);
    await this.profileContextService.requireAccount(request as never, user.id);

    return successResponse(await this.walletService.getWallet(user.id));
  }

  @Get("ledger")
  async ledger(@Req() request: unknown, @Query("view") view?: string, @Query("startDate") startDate?: string) {
    const user = await this.authService.me(request as never);
    await this.profileContextService.requireAccount(request as never, user.id);

    return successResponse(await this.walletService.listLedger(user.id, { startDate, view }));
  }
}
