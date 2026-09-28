import { IsEmail, IsString, MinLength } from "class-validator";

export class AdminLoginDto {
  @IsEmail({}, { message: "管理员邮箱格式不正确" })
  email!: string;

  @IsString({ message: "管理员密码不能为空" })
  @MinLength(8, { message: "管理员密码至少 8 位" })
  password!: string;
}
