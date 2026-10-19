-- An instance that already has accounts gets its admin here: the earliest one, which is whoever set it up. Without
-- this, an upgraded instance has users and no admin, and nobody could ever pair an OIDC provider from the app.
UPDATE "users" SET "is_admin" = true
WHERE "id" = (SELECT "id" FROM "users" ORDER BY "created_at", "id" LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM "users" WHERE "is_admin");
