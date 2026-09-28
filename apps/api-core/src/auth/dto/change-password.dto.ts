import { IsString, MaxLength, MinLength } from "class-validator";

export class VerifyPasswordDto {
  @IsString({ message: "登录密码不能为空" })
  @MinLength(1, { message: "登录密码不能为空" })
  password!: string;
}

export class ChangePasswordDto {
  @IsString({ message: "当前密码不能为空" })
  @MinLength(1, { message: "当前密码不能为空" })
  currentPassword!: string;

  @IsString({ message: "新密码不能为空" })
  @MinLength(6, { message: "新密码至少 6 位" })
  @MaxLength(72, { message: "新密码不能超过 72 个字符" })
  newPassword!: string;
}
