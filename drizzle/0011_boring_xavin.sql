CREATE TABLE "tmdb_episode_runtime" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tmdb_id" integer NOT NULL,
	"season_number" integer NOT NULL,
	"episode_number" integer NOT NULL,
	"runtime" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tmdb_episode_runtime_tmdb_id_season_number_episode_number_unique" UNIQUE("tmdb_id","season_number","episode_number")
);
--> statement-breakpoint
CREATE TABLE "tmdb_season_fetch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tmdb_id" integer NOT NULL,
	"season_number" integer NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tmdb_season_fetch_tmdb_id_season_number_unique" UNIQUE("tmdb_id","season_number")
);
--> statement-breakpoint
ALTER TABLE "tmdb_cache" ADD COLUMN "runtime" integer;