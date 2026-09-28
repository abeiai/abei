import { IsOptional, Matches } from "class-validator";

export class LogoutDto {
  @IsOptional()
  @Matches(/^\d{6}$/, { message: "切换密码必须为 6 位数字" })
  switchPassword?: string;
}
