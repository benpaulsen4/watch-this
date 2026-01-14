ALTER TABLE "tmdb_cache" ALTER COLUMN "genre_ids" SET DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "tmdb_cache" ADD COLUMN "cast_ids" integer[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "tmdb_cache" ADD COLUMN "keyword_ids" integer[] DEFAULT '{}' NOT NULL;