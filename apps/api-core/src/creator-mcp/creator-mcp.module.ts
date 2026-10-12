import { Module } from '@nestjs/common';
import { CreatorAuthModule } from '../creator-auth/creator-auth.module.js';
import { CreatorModule } from '../creator/creator.module.js';
import { CreatorMcpController } from './creator-mcp.controller.js';
@Module({imports:[CreatorModule,CreatorAuthModule],controllers:[CreatorMcpController]})
export class CreatorMcpModule {}
