ALTER TABLE "passkey_credentials" DROP CONSTRAINT "passkey_credentials_credential_id_unique";--> statement-breakpoint
CREATE INDEX "activity_feed_user_id_created_at_id_idx" ON "activity_feed" USING btree ("user_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "activity_feed_collaborators_idx" ON "activity_feed" USING gin ("collaborators");--> statement-breakpoint
CREATE INDEX "activity_feed_list_id_idx" ON "activity_feed" USING btree ("list_id");--> statement-breakpoint
CREATE INDEX "list_collaborators_user_id_idx" ON "list_collaborators" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "lists_owner_id_idx" ON "lists" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "passkey_credentials_credential_id_active_idx" ON "passkey_credentials" USING btree ("credential_id") WHERE "passkey_credentials"."deleted_at" is null;--> statement-breakpoint
--> LOGIC-05: purge any pre-existing out-of-range rows so ADD CONSTRAINT can
--> validate. These rows are unreachable garbage: `listSchedules` buckets by
--> day 0-6, so a row outside that range throws on every GET /api/schedules and
--> the UI that would delete it can never render. Expected to affect 0 rows.
DELETE FROM "show_schedules" WHERE "day_of_week" < 0 OR "day_of_week" > 6;--> statement-breakpoint
ALTER TABLE "show_schedules" ADD CONSTRAINT "show_schedules_day_of_week_range" CHECK ("show_schedules"."day_of_week" >= 0 AND "show_schedules"."day_of_week" <= 6);