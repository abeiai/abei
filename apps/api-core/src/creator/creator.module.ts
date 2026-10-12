import { Module } from '@nestjs/common';
import { CreatorAuthModule } from '../creator-auth/creator-auth.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AdminAuthModule } from '../admin-auth/admin-auth.module.js';
import { ProfilesModule } from '../profiles/profiles.module.js';
import { MediaModule } from '../media/media.module.js';
import { CreatorService } from './creator.service.js';
import { CreatorAssetsService } from './creator-assets.service.js';
import { CreatorMediaService } from './creator-media.service.js';
import { CreatorController, CreatorMediaController } from './creator.controller.js';
@Module({ imports: [CreatorAuthModule, AuthModule, AdminAuthModule, ProfilesModule, MediaModule], controllers: [CreatorController, CreatorMediaController], providers: [CreatorService, CreatorAssetsService, CreatorMediaService], exports: [CreatorService, CreatorAssetsService] })
export class CreatorModule {
}
