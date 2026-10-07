DROP INDEX "idx_entries_user_date";--> statement-breakpoint
ALTER TABLE "users" RENAME CONSTRAINT "users_email_key" TO "uq_users_email";