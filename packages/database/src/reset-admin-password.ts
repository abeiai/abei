import { getPrismaClient } from "./index.js";
import { hashPassword } from "./password.js";

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`请配置环境变量 ${name}`);
  }

  return value;
}

function adminEmail() {
  return process.env.ADMIN_EMAIL?.trim() || process.env.DEFAULT_ADMIN_EMAIL?.trim() || "";
}

async function main() {
  const email = adminEmail();
  const password = requiredEnv("ADMIN_PASSWORD");

  if (!email) {
    throw new Error("请配置 ADMIN_EMAIL，或使用 DEFAULT_ADMIN_EMAIL 作为管理员邮箱");
  }

  if (password.length < 12) {
    throw new Error("新密码至少需要 12 位");
  }

  const prisma = getPrismaClient();

  const admin = await prisma.adminUser.findUnique({
    where: {
      email
    },
    select: {
      id: true,
      email: true
    }
  });

  if (!admin) {
    throw new Error(`管理员不存在：${email}`);
  }

  await prisma.$transaction([
    prisma.adminUser.update({
      where: {
        id: admin.id
      },
      data: {
        passwordHash: await hashPassword(password),
        status: "ACTIVE"
      }
    }),
    prisma.refreshToken.updateMany({
      where: {
        adminUserId: admin.id,
        type: "ADMIN",
        revokedAt: null
      },
      data: {
        revokedAt: new Date()
      }
    })
  ]);

  console.log(`管理员密码已重置：${admin.email}`);
  console.log("该管理员已有后台登录会话已撤销。");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "管理员密码重置失败");
    process.exitCode = 1;
  })
  .finally(async () => {
    await getPrismaClient().$disconnect();
  });
