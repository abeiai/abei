BEGIN;

CREATE SEQUENCE "users_accountNumber_seq" START 10000;

ALTER TABLE "users"
  ADD COLUMN "accountNumber" INTEGER,
  ADD COLUMN "nextLearnerNumber" INTEGER NOT NULL DEFAULT 100;

WITH numbered_users AS (
  SELECT
    "id",
    9999 + ROW_NUMBER() OVER (ORDER BY "createdAt", "id") AS account_number
  FROM "users"
)
UPDATE "users" AS target
SET "accountNumber" = numbered_users.account_number
FROM numbered_users
WHERE target."id" = numbered_users."id";

DO $$
DECLARE
  max_account_number INTEGER;
BEGIN
  SELECT MAX("accountNumber") INTO max_account_number FROM "users";
  IF max_account_number IS NULL THEN
    PERFORM setval('"users_accountNumber_seq"', 10000, false);
  ELSE
    PERFORM setval('"users_accountNumber_seq"', max_account_number, true);
  END IF;
END;
$$;

ALTER SEQUENCE "users_accountNumber_seq" OWNED BY "users"."accountNumber";
ALTER TABLE "users"
  ALTER COLUMN "accountNumber" SET DEFAULT nextval('"users_accountNumber_seq"'),
  ALTER COLUMN "accountNumber" SET NOT NULL;

CREATE UNIQUE INDEX "users_accountNumber_key" ON "users"("accountNumber");
ALTER TABLE "users"
  ADD CONSTRAINT "users_accountNumber_range_check"
  CHECK ("accountNumber" >= 10000);

ALTER TABLE "learners" ADD COLUMN "accountNumber" INTEGER;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "learners"
    GROUP BY "userId"
    HAVING COUNT(*) > 900
  ) THEN
    RAISE EXCEPTION 'A main account cannot contain more than 900 learner accounts';
  END IF;
END;
$$;

WITH numbered_learners AS (
  SELECT
    "id",
    99 + ROW_NUMBER() OVER (
      PARTITION BY "userId"
      ORDER BY "createdAt", "id"
    ) AS account_number
  FROM "learners"
)
UPDATE "learners" AS target
SET "accountNumber" = numbered_learners.account_number
FROM numbered_learners
WHERE target."id" = numbered_learners."id";

ALTER TABLE "learners" ALTER COLUMN "accountNumber" SET NOT NULL;
CREATE UNIQUE INDEX "learners_userId_accountNumber_key"
  ON "learners"("userId", "accountNumber");
ALTER TABLE "learners"
  ADD CONSTRAINT "learners_accountNumber_range_check"
  CHECK ("accountNumber" BETWEEN 100 AND 999);

UPDATE "users" AS target
SET "nextLearnerNumber" = COALESCE(
  (
    SELECT MAX(learner."accountNumber") + 1
    FROM "learners" AS learner
    WHERE learner."userId" = target."id"
  ),
  100
);

ALTER TABLE "users"
  ADD CONSTRAINT "users_nextLearnerNumber_range_check"
  CHECK ("nextLearnerNumber" BETWEEN 100 AND 1000);

COMMIT;
