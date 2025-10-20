CREATE TABLE "user_streaming_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider_id" integer NOT NULL,
	"provider_name" varchar(100),
	"logo_path" varchar(255),
	"region" varchar(2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_streaming_providers_user_id_provider_id_region_unique" UNIQUE("user_id","provider_id","region")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "country" varchar(2);--> statement-breakpoint
ALTER TABLE "user_streaming_providers" ADD CONSTRAINT "user_streaming_providers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;