CREATE TABLE "tmdb_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tmdb_id" integer NOT NULL,
	"content_type" varchar(10) NOT NULL,
	"title" varchar(255) NOT NULL,
	"overview" text NOT NULL,
	"poster_path" varchar(255),
	"backdrop_path" varchar(255),
	"release_date" timestamp with time zone NOT NULL,
	"vote_average" numeric(3, 1) NOT NULL,
	"vote_count" integer NOT NULL,
	"popularity" numeric(6, 2) NOT NULL,
	"genre_ids" integer[] NOT NULL,
	"adult" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tmdb_cache_tmdb_id_content_type_unique" UNIQUE("tmdb_id","content_type")
);
--> statement-breakpoint
ALTER TABLE "list_items" DROP COLUMN "title";--> statement-breakpoint
ALTER TABLE "list_items" DROP COLUMN "poster_path";