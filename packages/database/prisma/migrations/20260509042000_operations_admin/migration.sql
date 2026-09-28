-- Add last login tracking for operations admin user lists.
ALTER TABLE "users" ADD COLUMN "lastLoginAt" TIMESTAMP(3);
