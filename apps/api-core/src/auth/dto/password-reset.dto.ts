import {
  IsEmail,
  IsIn,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf
} from "class-validator";

const phoneMessage = "手机号格式不正确";
const phonePattern = /^1[3-9]\d{9}$/;

export class VerifyPasswordResetCodeDto {
  @IsIn(["EMAIL", "PHONE"], { message: "验证方式不正确" })
  method!: "EMAIL" | "PHONE";

  @ValidateIf((dto: VerifyPasswordResetCodeDto) => dto.method === "EMAIL")
  @IsEmail({}, { message: "邮箱格式不正确" })
  email?: string;

  @ValidateIf((dto: VerifyPasswordResetCodeDto) => dto.method === "PHONE")
  @Matches(phonePattern, { message: phoneMessage })
  phone?: string;

  @IsString({ message: "验证码不能为空" })
  @MinLength(4, { message: "验证码格式不正确" })
  @MaxLength(8, { message: "验证码格式不正确" })
  code!: string;
}

export class ResetPasswordWithTokenDto {
  @IsString({ message: "重置凭证不能为空" })
  @MinLength(16, { message: "重置凭证格式不正确" })
  resetToken!: string;

  @IsString({ message: "密码不能为空" })
  @MinLength(6, { message: "密码至少 6 位" })
  @MaxLength(72, { message: "密码不能超过 72 个字符" })
  password!: string;
}
