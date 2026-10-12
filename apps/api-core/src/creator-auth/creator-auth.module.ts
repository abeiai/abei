import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CreatorAuthController } from './creator-auth.controller.js';
import { CreatorAuthService } from './creator-auth.service.js';

@Module({ imports: [AuthModule], controllers: [CreatorAuthController], providers: [CreatorAuthService], exports: [CreatorAuthService] })
export class CreatorAuthModule {}
