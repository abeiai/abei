import assert from "node:assert/strict";
import test from "node:test";

import { EnglishGuidedStudyService } from "../src/english-guided-study/english-guided-study.service.js";
import type { ProfileSubject } from "../src/profiles/profile-context.types.js";

const learnerSubject: ProfileSubject = {
  userId: "user-1",
  mode: "LEARNER",
  learnerId: "learner-1"
};

test("古诗文全部历史按关键词分页且固定每页二十条", async () => {
  const findManyInputs: unknown[] = [];
  const countInputs: unknown[] = [];
  const service = new EnglishGuidedStudyService({} as never, {} as never, {} as never, {} as never);

  Object.defineProperty(service, "prisma", {
    value: {
      englishGuidedStudyMaterial: {
        count: async (input: unknown) => {
          countInputs.push(input);
          return 45;
        },
        findMany: async (input: unknown) => {
          findManyInputs.push(input);
          return [];
        }
      }
    }
  });

  const result = await service.listUserMaterialHistory(
    learnerSubject,
    "GUSHIWEN",
    { page: "2", search: "  离骚  " }
  );

  assert.deepEqual(result, {
    items: [],
    page: 2,
    pageSize: 20,
    total: 45,
    totalPages: 3
  });
  assert.deepEqual(findManyInputs, [{
    where: {
      userId: "user-1",
      learnerId: "learner-1",
      content: { path: ["scene"], equals: "GUSHIWEN" },
      OR: [
        { title: { contains: "离骚", mode: "insensitive" } },
        { sourceName: { contains: "离骚", mode: "insensitive" } },
        { sourceText: { contains: "离骚", mode: "insensitive" } }
      ]
    },
    orderBy: [
      { pinnedAt: { sort: "desc", nulls: "last" } },
      { createdAt: "desc" }
    ],
    skip: 20,
    take: 20
  }]);
  assert.deepEqual(countInputs, [{ where: (findManyInputs[0] as { where: unknown }).where }]);
});
