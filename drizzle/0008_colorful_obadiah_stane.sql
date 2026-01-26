CREATE TABLE "list_recommendations_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_id" uuid NOT NULL,
	"recommendations" jsonb NOT NULL,
	"items_updated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "list_recommendations_cache_list_id_unique" UNIQUE("list_id")
);
--> statement-breakpoint
ALTER TABLE "list_recommendations_cache" ADD CONSTRAINT "list_recommendations_cache_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE cascade ON UPDATE no action;