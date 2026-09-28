import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { ProfilesModule } from "../profiles/profiles.module.js";
import { WalletController } from "./wallet.controller.js";
import { WalletService } from "./wallet.service.js";

@Module({
  imports: [AuthModule, ProfilesModule],
  controllers: [WalletController],
  providers: [WalletService],
  exports: [WalletService]
})
export class WalletModule {}
