import { IsEmail, IsString, MinLength } from "class-validator";

export class LoginDto {
  @IsEmail({}, { message: "邮箱格式不正确" })
  email!: string;

  @IsString({ message: "密码不能为空" })
  @MinLength(8, { message: "密码至少 8 位" })
  password!: string;
}
