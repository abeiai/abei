import type { Prisma } from "@xueleai/database";

// Only called inside the transaction that creates a new account.
export async function createRegistrationWallet(tx: Prisma.TransactionClient, userId: string) {
  const wallet = await tx.wallet.create({ data: { userId, availableCredits: 100 } });
  await tx.ledgerEntry.create({ data: {
    userId,
    type: "ADMIN_ADJUST",
    amount: 100,
    balanceAfter: wallet.availableCredits,
    idempotencyKey: `registration:${userId}`,
    note: "新用户注册赠送 100 点，永不过期"
  } });
  return wallet;
}
