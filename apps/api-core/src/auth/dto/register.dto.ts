import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class RegisterDto {
  @IsEmail({}, { message: "邮箱格式不正确" })
  email!: string;

  @IsString({ message: "密码不能为空" })
  @MinLength(8, { message: "密码至少 8 位" })
  password!: string;

  @IsString({ message: "验证码不能为空" })
  @MinLength(4, { message: "验证码格式不正确" })
  @MaxLength(8, { message: "验证码格式不正确" })
  emailCode!: string;

  @IsOptional()
  @IsString({ message: "昵称格式不正确" })
  @MaxLength(32, { message: "昵称不能超过 32 个字符" })
  nickname?: string;
}
