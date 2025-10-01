CREATE TABLE "show_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tmdb_id" integer NOT NULL,
	"day_of_week" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "show_schedules_user_id_tmdb_id_day_of_week_unique" UNIQUE("user_id","tmdb_id","day_of_week")
);
--> statement-breakpoint
ALTER TABLE "show_schedules" ADD CONSTRAINT "show_schedules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;