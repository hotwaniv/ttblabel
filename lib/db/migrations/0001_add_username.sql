ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "username" varchar(32);

UPDATE "User"
SET "username" = split_part("email", '@', 1)
WHERE "username" IS NULL;

UPDATE "User"
SET "username" = 'user_' || substr(replace("id"::text, '-', ''), 1, 8)
WHERE "username" IS NULL OR "username" = '';

ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "User_username_unique" ON "User" ("username");
