import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

const phoneMessage = "手机号格式不正确";
const phonePattern = /^1[3-9]\d{9}$/;

export class SendPhoneCodeDto {
  @Matches(phonePattern, { message: phoneMessage })
  phone!: string;

  @IsOptional()
  @IsIn(["LOGIN", "BIND_PHONE", "RESET_PASSWORD"], { message: "验证码用途不正确" })
  purpose?: "LOGIN" | "BIND_PHONE" | "RESET_PASSWORD";
}

export class PhoneLoginDto {
  @Matches(phonePattern, { message: phoneMessage })
  phone!: string;

  @IsString({ message: "验证码不能为空" })
  @MinLength(4, { message: "验证码格式不正确" })
  @MaxLength(8, { message: "验证码格式不正确" })
  code!: string;

  @IsOptional()
  @IsString({ message: "昵称格式不正确" })
  @MaxLength(32, { message: "昵称不能超过 32 个字符" })
  nickname?: string;
}

export class BindPhoneDto {
  @Matches(phonePattern, { message: phoneMessage })
  phone!: string;

  @IsString({ message: "登录密码不能为空" })
  @MinLength(1, { message: "登录密码不能为空" })
  currentPassword!: string;

  @IsString({ message: "验证码不能为空" })
  @MinLength(4, { message: "验证码格式不正确" })
  @MaxLength(8, { message: "验证码格式不正确" })
  code!: string;
}
