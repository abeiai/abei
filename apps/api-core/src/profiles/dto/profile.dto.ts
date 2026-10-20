import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength
} from "class-validator";
import { learnerGradeOptions, type LearnerGradeValue } from "../learner-grade.js";

const learnerGradeValues = learnerGradeOptions.map((option) => option.value);

export class CreateLearnerDto {
  @IsString({ message: "昵称不能为空" })
  @MinLength(1, { message: "昵称长度必须为 1 到 30 个字符" })
  @MaxLength(30, { message: "昵称长度必须为 1 到 30 个字符" })
  nickname!: string;

  @IsIn(learnerGradeValues, { message: "学段不正确" })
  grade!: LearnerGradeValue;

  @IsOptional()
  @Matches(/^\d{6}$/, { message: "切换密码必须为 6 位数字" })
  switchPassword?: string;

  @IsOptional()
  @IsArray({ message: "应用授权参数不正确" })
  @ArrayMaxSize(200, { message: "应用授权数量过多" })
  @IsString({ each: true, message: "应用授权参数不正确" })
  @Matches(/\S/u, { each: true, message: "授权项不能为空" })
  scenarioIds?: string[];

  @IsOptional()
  @IsArray({ message: "专辑授权参数不正确" })
  @ArrayMaxSize(200, { message: "专辑授权数量过多" })
  @IsString({ each: true, message: "专辑授权参数不正确" })
  @Matches(/\S/u, { each: true, message: "授权项不能为空" })
  courseIds?: string[];
}

export class UpdateLearnerDto {
  @IsOptional()
  @IsString({ message: "昵称参数不正确" })
  @MinLength(1, { message: "昵称长度必须为 1 到 30 个字符" })
  @MaxLength(30, { message: "昵称长度必须为 1 到 30 个字符" })
  nickname?: string;

  @IsOptional()
  @IsIn(learnerGradeValues, { message: "学段不正确" })
  grade?: LearnerGradeValue;
}

export class UpdateCurrentLearnerDto {
  @IsString({ message: "昵称参数不正确" })
  @MinLength(1, { message: "昵称长度必须为 1 到 30 个字符" })
  @MaxLength(30, { message: "昵称长度必须为 1 到 30 个字符" })
  nickname!: string;
}

export class UpdateLearnerAuthorizationsDto {
  @IsArray({ message: "应用授权参数不正确" })
  @ArrayMaxSize(200, { message: "应用授权数量过多" })
  @IsString({ each: true, message: "应用授权参数不正确" })
  @Matches(/\S/u, { each: true, message: "授权项不能为空" })
  scenarioIds!: string[];

  @IsArray({ message: "专辑授权参数不正确" })
  @ArrayMaxSize(200, { message: "专辑授权数量过多" })
  @IsString({ each: true, message: "专辑授权参数不正确" })
  @Matches(/\S/u, { each: true, message: "授权项不能为空" })
  courseIds!: string[];
}

export class UpdateSwitchPasswordDto {
  @IsString({ message: "请输入主账号登录密码" })
  currentPassword!: string;

  @Matches(/^\d{6}$/, { message: "切换密码必须为 6 位数字" })
  switchPassword!: string;
}

export class SelectProfileDto {
  @IsIn(["ACCOUNT", "LEARNER"], { message: "身份类型不正确" })
  mode!: "ACCOUNT" | "LEARNER";

  @IsOptional()
  @IsString({ message: "学习者参数不正确" })
  learnerId?: string | null;
}

export class EnterLearnerDto {
  @IsString({ message: "请选择学习者" })
  learnerId!: string;
}

export class SwitchLearnerDto extends EnterLearnerDto {
  @Matches(/^\d{6}$/, { message: "切换密码必须为 6 位数字" })
  switchPassword!: string;
}

export class ReturnToAccountDto {
  @IsString({ message: "登录密码不能为空" })
  password!: string;
}
