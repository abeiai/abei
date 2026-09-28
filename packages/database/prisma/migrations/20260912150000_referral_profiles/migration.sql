CREATE TABLE "referral_handles" (
  "handle" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('RANDOM', 'ALIAS')),
  "status" TEXT NOT NULL DEFAULT 'ACTIVE' CHECK ("status" IN ('PENDING', 'ACTIVE', 'REJECTED')),
  "reviewedBy" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "referral_handles_shape" CHECK (
    ("kind" = 'RANDOM' AND "handle" ~ '^[a-z0-9]{8}$' AND "status" = 'ACTIVE') OR
    ("kind" = 'ALIAS' AND "handle" ~ '^[a-z]{4,32}$' AND "handle" NOT LIKE '%xuele%')
  )
);
CREATE UNIQUE INDEX "referral_handles_userId_kind_key" ON "referral_handles"("userId", "kind");
CREATE INDEX "referral_handles_status_createdAt_idx" ON "referral_handles"("status", "createdAt");

CREATE TABLE "referral_visits" (
  "tokenHash" TEXT PRIMARY KEY,
  "referrerId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CHECK ("expiresAt" > "createdAt")
);
CREATE INDEX "referral_visits_expiresAt_idx" ON "referral_visits"("expiresAt");
CREATE TABLE "referral_rewards" (
  "inviteeId" TEXT PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "referrerId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "visitHash" TEXT NOT NULL REFERENCES "referral_visits"("tokenHash") ON DELETE RESTRICT,
  "credits" INTEGER NOT NULL DEFAULT 500 CHECK ("credits" = 500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("inviteeId" <> "referrerId")
);
CREATE UNIQUE INDEX "referral_rewards_visitHash_key" ON "referral_rewards"("visitHash");
CREATE INDEX "referral_rewards_referrerId_createdAt_idx" ON "referral_rewards"("referrerId", "createdAt");

-- Shared namespace: an alias can never shadow an existing random code.
CREATE FUNCTION xueleai_create_referral_handle(account_id TEXT) RETURNS VOID AS $$
DECLARE candidate TEXT; entropy BYTEA; i INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM "referral_handles" WHERE "userId" = account_id AND "kind" = 'RANDOM') THEN RETURN; END IF;
  LOOP
    entropy := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    candidate := '';
    FOR i IN 0..7 LOOP
      candidate := candidate || substr('abcdefghijklmnopqrstuvwxyz0123456789', (get_byte(entropy, i) % 36) + 1, 1);
    END LOOP;
    IF candidate !~ '[a-z]' OR candidate !~ '[0-9]' THEN CONTINUE; END IF;
    INSERT INTO "referral_handles" ("handle", "userId", "kind") VALUES (candidate, account_id, 'RANDOM') ON CONFLICT DO NOTHING;
    IF FOUND OR EXISTS (SELECT 1 FROM "referral_handles" WHERE "userId" = account_id AND "kind" = 'RANDOM') THEN RETURN; END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;
CREATE FUNCTION xueleai_referral_handle_on_user_insert() RETURNS TRIGGER AS $$
BEGIN
  PERFORM xueleai_create_referral_handle(NEW."id");
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER xueleai_referral_handle_after_insert AFTER INSERT ON "users"
FOR EACH ROW EXECUTE FUNCTION xueleai_referral_handle_on_user_insert();
SELECT xueleai_create_referral_handle("id") FROM "users";
