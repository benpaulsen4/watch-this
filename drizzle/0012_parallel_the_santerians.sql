CREATE TABLE "series_finale" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"period_label" varchar(32) NOT NULL,
	"payload" jsonb NOT NULL,
	"schema_version" integer NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dismissed_at" timestamp with time zone,
	CONSTRAINT "series_finale_user_id_period_start_period_end_unique" UNIQUE("user_id","period_start","period_end")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "share_stats_with_collaborators" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "series_finale" ADD CONSTRAINT "series_finale_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "series_finale_user_id_period_start_idx" ON "series_finale" USING btree ("user_id","period_start" DESC NULLS LAST);