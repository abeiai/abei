import { IsEmail, IsIn, IsString, MaxLength, MinLength } from "class-validator";

export class SendEmailCodeDto {
  @IsEmail({}, { message: "邮箱格式不正确" })
  email!: string;

  @IsIn(["REGISTER", "RESET_PASSWORD"], { message: "验证码用途不正确" })
  purpose!: "REGISTER" | "RESET_PASSWORD";
}

export class SendChangeEmailCodeDto {
  @IsEmail({}, { message: "邮箱格式不正确" })
  email!: string;
}

export class ChangeEmailDto {
  @IsEmail({}, { message: "邮箱格式不正确" })
  email!: string;

  @IsString({ message: "登录密码不能为空" })
  @MinLength(1, { message: "登录密码不能为空" })
  currentPassword!: string;

  @IsString({ message: "验证码不能为空" })
  @MinLength(4, { message: "验证码格式不正确" })
  @MaxLength(8, { message: "验证码格式不正确" })
  emailCode!: string;
}

export class ResetPasswordDto {
  @IsEmail({}, { message: "邮箱格式不正确" })
  email!: string;

  @IsString({ message: "验证码不能为空" })
  @MinLength(4, { message: "验证码格式不正确" })
  @MaxLength(8, { message: "验证码格式不正确" })
  emailCode!: string;

  @IsString({ message: "密码不能为空" })
  @MinLength(8, { message: "密码至少 8 位" })
  password!: string;
}
