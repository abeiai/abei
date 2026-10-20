import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  Max,
  Min,
  ValidateNested
} from "class-validator";
import type { LearningMaterialType } from "../learner-learning.types.js";

export class StartLearnerLearningSessionDto {
  @IsString({ message: "学习会话参数不正确" })
  @Length(16, 80, { message: "学习会话参数不正确" })
  clientSessionKey!: string;
}

export class LearnerLearningContextDto {
  @IsBoolean({ message: "学习状态参数不正确" })
  isLearning!: boolean;

  @IsOptional()
  @IsString({ message: "应用参数不正确" })
  @MaxLength(128, { message: "应用参数过长" })
  scenarioId?: string;

  @IsOptional()
  @IsString({ message: "专辑参数不正确" })
  @MaxLength(128, { message: "专辑参数过长" })
  courseId?: string;

  @IsOptional()
  @IsString({ message: "课件项参数不正确" })
  @MaxLength(128, { message: "课件项参数过长" })
  courseRevisionItemId?: string;

  @IsOptional()
  @IsString({ message: "资源类型参数不正确" })
  @MaxLength(64, { message: "资源类型参数过长" })
  resourceType?: string;

  @IsOptional()
  @IsString({ message: "资源参数不正确" })
  @MaxLength(128, { message: "资源参数过长" })
  resourceId?: string;

  @IsOptional()
  @IsIn(["VIDEO_GUIDE", "ENGLISH_GUIDED_STUDY", "LEARNING_FLASHCARD", "PICTURE_BOOK"], {
    message: "课件类型不正确"
  })
  materialType?: LearningMaterialType;

  @IsOptional()
  @IsString({ message: "课件参数不正确" })
  @MaxLength(128, { message: "课件参数过长" })
  materialId?: string;

  @IsOptional()
  @IsString({ message: "学习部分参数不正确" })
  @MaxLength(64, { message: "学习部分参数过长" })
  partKey?: string;
}

export class LearnerLearningHeartbeatDto {
  @IsInt({ message: "心跳序号不正确" })
  @Min(1, { message: "心跳序号不正确" })
  sequence!: number;

  @IsDateString({}, { message: "客户端时间不正确" })
  clientSentAt!: string;

  @IsBoolean({ message: "页面可见状态不正确" })
  pageVisible!: boolean;

  @IsBoolean({ message: "页面焦点状态不正确" })
  hasFocus!: boolean;

  @IsBoolean({ message: "媒体播放状态不正确" })
  mediaPlaying!: boolean;

  @IsDateString({}, { message: "交互时间不正确" })
  lastInteractionAt!: string;

  @ValidateNested()
  @Type(() => LearnerLearningContextDto)
  context!: LearnerLearningContextDto;
}

export class LearnerLearningOverviewQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/u, { message: "开始日期格式不正确" })
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/u, { message: "结束日期格式不正确" })
  to?: string;
}

export class LearnerLearningMaterialsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "数量参数不正确" })
  @Min(1, { message: "数量参数不正确" })
  @Max(100, { message: "数量参数不正确" })
  limit?: number;
}

export class AccountLearnerLearningQueryDto extends LearnerLearningOverviewQueryDto {
  @IsOptional()
  @IsString({ message: "应用参数不正确" })
  @MaxLength(128, { message: "应用参数过长" })
  scenarioId?: string;

  @IsOptional()
  @IsString({ message: "专辑参数不正确" })
  @MaxLength(128, { message: "专辑参数过长" })
  courseId?: string;

  @IsOptional()
  @IsString({ message: "资源类型参数不正确" })
  @MaxLength(64, { message: "资源类型参数过长" })
  resourceType?: string;

  @IsOptional()
  @IsString({ message: "资源参数不正确" })
  @MaxLength(128, { message: "资源参数过长" })
  resourceId?: string;

  @IsOptional()
  @IsIn(["VIDEO_GUIDE", "ENGLISH_GUIDED_STUDY", "LEARNING_FLASHCARD", "PICTURE_BOOK"], {
    message: "课件类型不正确"
  })
  materialType?: LearningMaterialType;

  @IsOptional()
  @IsString({ message: "课件参数不正确" })
  @MaxLength(128, { message: "课件参数过长" })
  materialId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "数量参数不正确" })
  @Min(1, { message: "数量参数不正确" })
  @Max(100, { message: "数量参数不正确" })
  limit?: number;
}

const learnerLearningEventTypes = [
  "MATERIAL_STARTED",
  "MEDIA_PROGRESS",
  "NODE_LEARNED",
  "PRACTICE_SUBMITTED",
  "READ_ALONG_COMPLETED",
  "FLASHCARD_REVIEWED"
] as const;

export class LearnerLearningEventDto {
  @IsString({ message: "事件编号不正确" })
  @Length(16, 100, { message: "事件编号不正确" })
  eventId!: string;

  @IsInt({ message: "事件序号不正确" })
  @Min(1, { message: "事件序号不正确" })
  sequence!: number;

  @IsIn(learnerLearningEventTypes, { message: "学习事件类型不正确" })
  type!: (typeof learnerLearningEventTypes)[number];

  @IsDateString({}, { message: "事件时间不正确" })
  occurredAt!: string;

  @IsString({ message: "学习部分参数不正确" })
  @MaxLength(64, { message: "学习部分参数过长" })
  partKey!: string;

  @ValidateNested()
  @Type(() => LearnerLearningContextDto)
  context!: LearnerLearningContextDto;

  @IsOptional()
  @IsString({ message: "学习节点参数不正确" })
  @MaxLength(128, { message: "学习节点参数过长" })
  itemId?: string;

  @IsOptional()
  @IsString({ message: "复习记录参数不正确" })
  @MaxLength(128, { message: "复习记录参数过长" })
  reviewId?: string;

  @IsOptional()
  @IsInt({ message: "练习选项参数不正确" })
  @Min(0, { message: "练习选项参数不正确" })
  selectedIndex?: number;

  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false }, { message: "播放起点不正确" })
  @Min(0, { message: "播放起点不正确" })
  startSeconds?: number;

  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false }, { message: "播放终点不正确" })
  @Min(0, { message: "播放终点不正确" })
  endSeconds?: number;

  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false }, { message: "媒体时长不正确" })
  @Min(0.01, { message: "媒体时长不正确" })
  mediaDurationSeconds?: number;
}

export class RecordLearnerLearningEventsDto {
  @IsArray({ message: "学习事件参数不正确" })
  @ArrayMaxSize(50, { message: "每次最多同步 50 条学习事件" })
  @ValidateNested({ each: true })
  @Type(() => LearnerLearningEventDto)
  events!: LearnerLearningEventDto[];
}
