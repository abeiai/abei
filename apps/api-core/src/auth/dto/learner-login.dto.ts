import { IsString, Matches, MaxLength } from "class-validator";

export class LearnerLoginDto {
  @IsString({ message: "主账号 ID 不能为空" })
  @Matches(/^[1-9]\d{4,}$/, { message: "主账号 ID 格式不正确" })
  @MaxLength(10, { message: "主账号 ID 格式不正确" })
  accountId!: string;

  @IsString({ message: "子账号 ID 不能为空" })
  @Matches(/^\d{3}$/, { message: "子账号 ID 格式不正确" })
  learnerId!: string;

  @IsString({ message: "切换密码不能为空" })
  @Matches(/^\d{6}$/, { message: "切换密码必须为 6 位数字" })
  switchPassword!: string;
}
