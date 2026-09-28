/** In-memory delegates for existing tests which represent a nonmember wallet. */
export function membershipWalletFixture() {
  type Allocation = { operationKey: string; userId: string; membershipCredits: number; purchasedCredits: number; periodId: string | null; settled: boolean };
  const allocations = new Map<string, Allocation>();
  return {
    membershipPeriod: { findMany: async () => [] },
    membershipCreditAllocation: {
      findUnique: async ({ where }: { where: { operationKey: string } }) => allocations.get(where.operationKey) ?? null,
      create: async ({ data }: { data: Allocation }) => {
        allocations.set(data.operationKey, { ...data });
        return { ...data };
      },
      update: async ({ where, data }: { where: { operationKey: string }; data: Partial<Allocation> }) => {
        const row = allocations.get(where.operationKey);
        if (!row) throw new Error("测试冻结记录不存在");
        Object.assign(row, data);
        return { ...row };
      }
    }
  };
}
