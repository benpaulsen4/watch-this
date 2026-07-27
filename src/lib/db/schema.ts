import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  decimal,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// Users table
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: varchar("username", { length: 50 }).notNull().unique(),
  profilePictureUrl: varchar("profile_picture_url", { length: 500 }),
  timezone: varchar("timezone", { length: 100 }).notNull().default("UTC"),
  country: varchar("country", { length: 2 }),
  // Incremented to invalidate all outstanding session JWTs for this user
  // (e.g. on "sign out all devices" or passkey deletion). Sessions carry the
  // value they were minted with and are rejected once it falls behind.
  tokenVersion: integer("token_version").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Passkey credentials table
export const passkeyCredentials = pgTable(
  "passkey_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // DATA-02: NOT unconditionally unique. Deleting a passkey soft-deletes the
    // row (`deleted_at` is set) but keeps it for audit purposes, so a plain
    // UNIQUE would permanently block re-enrolling the same authenticator --
    // with no account-recovery path, that is a lockout risk. The partial unique
    // index below enforces uniqueness only across *live* credentials.
    credentialId: varchar("credential_id", { length: 255 }).notNull(),
    publicKey: text("public_key").notNull(),
    counter: bigint("counter", { mode: "number" }).default(0).notNull(),
    deviceName: varchar("device_name", { length: 100 }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastUsed: timestamp("last_used", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("passkey_credentials_credential_id_active_idx")
      .on(table.credentialId)
      .where(sql`${table.deletedAt} is null`),
  ],
);

// Lists table
export const lists = pgTable(
  "lists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
    listType: varchar("list_type", { length: 20 }).default("mixed").notNull(),
    isPublic: boolean("is_public").default(false).notNull(),
    isArchived: boolean("is_archived").default(false).notNull(),
    syncWatchStatus: boolean("sync_watch_status").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  // DATA-01: Postgres does not auto-index foreign keys. Every "my lists" query
  // filters on owner_id, and cascade deletes of a user scan this table.
  (table) => [index("lists_owner_id_idx").on(table.ownerId)],
);

// List collaborators table
export const listCollaborators = pgTable(
  "list_collaborators",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listId: uuid("list_id")
      .notNull()
      .references(() => lists.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    permissionLevel: varchar("permission_level", { length: 20 })
      .default("collaborator")
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique().on(table.listId, table.userId),
    // DATA-01: the composite unique already covers lookups by list_id, but
    // "lists I collaborate on" and the user cascade delete filter on user_id,
    // which is not a prefix of that index.
    index("list_collaborators_user_id_idx").on(table.userId),
  ],
);

// List items table
export const listItems = pgTable(
  "list_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listId: uuid("list_id")
      .notNull()
      .references(() => lists.id, { onDelete: "cascade" }),
    tmdbId: integer("tmdb_id").notNull(),
    contentType: varchar("content_type", { length: 10 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [unique().on(table.listId, table.tmdbId, table.contentType)],
);

export const listRecommendationsCache = pgTable(
  "list_recommendations_cache",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listId: uuid("list_id")
      .notNull()
      .references(() => lists.id, { onDelete: "cascade" }),
    recommendations: jsonb("recommendations")
      .$type<{ tmdbId: number; contentType: ContentTypeEnum }[]>()
      .notNull(),
    itemsUpdatedAt: timestamp("items_updated_at", {
      withTimezone: true,
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [unique().on(table.listId)],
);

// User content status table
export const userContentStatus = pgTable(
  "user_content_status",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tmdbId: integer("tmdb_id").notNull(),
    contentType: varchar("content_type", { length: 10 }).notNull(),
    status: varchar("status", { length: 20 }).default("planning").notNull(),
    nextEpisodeDate: timestamp("next_episode_date", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [unique().on(table.userId, table.tmdbId, table.contentType)],
);

// Episode watch status table
export const episodeWatchStatus = pgTable(
  "episode_watch_status",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tmdbId: integer("tmdb_id").notNull(),
    seasonNumber: integer("season_number").notNull(),
    episodeNumber: integer("episode_number").notNull(),
    watched: boolean("watched").default(false).notNull(),
    watchedAt: timestamp("watched_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique().on(
      table.userId,
      table.tmdbId,
      table.seasonNumber,
      table.episodeNumber,
    ),
  ],
);

// Activity feed table
export const activityFeed = pgTable(
  "activity_feed",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    activityType: varchar("activity_type", { length: 50 }).notNull(),
    tmdbId: integer("tmdb_id"),
    contentType: varchar("content_type", { length: 10 }),
    listId: uuid("list_id").references(() => lists.id, { onDelete: "cascade" }),
    metadata: jsonb("metadata"),
    collaborators: uuid("collaborators").array(),
    isCollaborative: boolean("is_collaborative").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  // DATA-01: the dashboard feed filters `user_id = $1 OR collaborators @> $1`
  // and pages by (created_at DESC, id DESC). Without these it is a full scan
  // plus a full sort on every dashboard load.
  (table) => [
    index("activity_feed_user_id_created_at_id_idx").on(
      table.userId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    index("activity_feed_collaborators_idx").using("gin", table.collaborators),
    index("activity_feed_list_id_idx").on(table.listId),
  ],
);

// Passkey claims table
export const passkeyClaims = pgTable("passkey_claims", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  claimCode: varchar("claim_code", { length: 64 }).notNull().unique(),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  initiator: varchar("initiator", { length: 10 }).notNull().default("user"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
});

// Show schedules table
export const showSchedules = pgTable(
  "show_schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tmdbId: integer("tmdb_id").notNull(),
    dayOfWeek: integer("day_of_week").notNull(), // 0 = Sunday, 6 = Saturday
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique().on(table.userId, table.tmdbId, table.dayOfWeek),
    // LOGIC-05: `listSchedules` buckets rows into keys 0-6. A row outside that
    // range (only reachable via import, which historically did no validation)
    // permanently broke GET /api/schedules for that user. Enforce the domain in
    // the database so no write path can reintroduce it.
    check(
      "show_schedules_day_of_week_range",
      sql`${table.dayOfWeek} >= 0 AND ${table.dayOfWeek} <= 6`,
    ),
  ],
);

// User streaming providers table
export const userStreamingProviders = pgTable(
  "user_streaming_providers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    providerId: integer("provider_id").notNull(),
    providerName: varchar("provider_name", { length: 100 }),
    logoPath: varchar("logo_path", { length: 255 }),
    region: varchar("region", { length: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [unique().on(table.userId, table.providerId, table.region)],
);

// TMDB Cache table
export const tmdbCache = pgTable(
  "tmdb_cache",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tmdbId: integer("tmdb_id").notNull(),
    contentType: varchar("content_type", { length: 10 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    overview: text("overview").notNull(),
    posterPath: varchar("poster_path", { length: 255 }),
    backdropPath: varchar("backdrop_path", { length: 255 }),
    releaseDate: timestamp("release_date", { withTimezone: true }).notNull(),
    voteAverage: decimal("vote_average", { precision: 3, scale: 1 }).notNull(),
    voteCount: integer("vote_count").notNull(),
    popularity: decimal("popularity", { precision: 6, scale: 2 }).notNull(),
    genreIds: integer("genre_ids").array().notNull().default([]),
    castIds: integer("cast_ids").array().notNull().default([]),
    keywordIds: integer("keyword_ids").array().notNull().default([]),
    adult: boolean("adult"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [unique().on(table.tmdbId, table.contentType)],
);

// Relations
// Types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type PasskeyCredential = typeof passkeyCredentials.$inferSelect;
export type NewPasskeyCredential = typeof passkeyCredentials.$inferInsert;
export type PasskeyClaim = typeof passkeyClaims.$inferSelect;
export type NewPasskeyClaim = typeof passkeyClaims.$inferInsert;

export type List = typeof lists.$inferSelect;
export type NewList = typeof lists.$inferInsert;

export type ListCollaborator = typeof listCollaborators.$inferSelect;
export type NewListCollaborator = typeof listCollaborators.$inferInsert;

export type ListItem = typeof listItems.$inferSelect;
export type NewListItem = typeof listItems.$inferInsert;

export type ListRecommendationsCache =
  typeof listRecommendationsCache.$inferSelect;
export type NewListRecommendationsCache =
  typeof listRecommendationsCache.$inferInsert;

export type UserContentStatus = typeof userContentStatus.$inferSelect;
export type NewUserContentStatus = typeof userContentStatus.$inferInsert;

export type EpisodeWatchStatus = typeof episodeWatchStatus.$inferSelect;
export type NewEpisodeWatchStatus = typeof episodeWatchStatus.$inferInsert;

export type ActivityFeed = typeof activityFeed.$inferSelect;
export type NewActivityFeed = typeof activityFeed.$inferInsert;

export type ShowSchedule = typeof showSchedules.$inferSelect;
export type NewShowSchedule = typeof showSchedules.$inferInsert;

export type UserStreamingProvider = typeof userStreamingProviders.$inferSelect;
export type NewUserStreamingProvider =
  typeof userStreamingProviders.$inferInsert;

export type TMDBCache = typeof tmdbCache.$inferSelect;
export type NewTMDBCache = typeof tmdbCache.$inferInsert;

// Enums for type safety
export const ListType = {
  MOVIE: "movies",
  TV: "tv",
  MIXED: "mixed",
} as const;

export const ContentType = {
  MOVIE: "movie",
  TV: "tv",
} as const;

export const WatchStatus = {
  PLANNING: "planning",
  WATCHING: "watching",
  PAUSED: "paused",
  COMPLETED: "completed",
  DROPPED: "dropped",
} as const;

// Movie-specific statuses
export const MovieWatchStatus = {
  PLANNING: "planning",
  COMPLETED: "completed",
} as const;

// TV show-specific statuses
export const TVWatchStatus = {
  PLANNING: "planning",
  WATCHING: "watching",
  PAUSED: "paused",
  COMPLETED: "completed",
  DROPPED: "dropped",
} as const;

export const PermissionLevel = {
  COLLABORATOR: "collaborator",
  VIEWER: "viewer",
} as const;

export const ActivityType = {
  STATUS_CHANGED: "status_changed",
  EPISODE_PROGRESS: "episode_progress",
  LIST_ITEM_ADDED: "list_item_added",
  LIST_ITEM_REMOVED: "list_item_removed",
  LIST_CREATED: "list_created",
  LIST_UPDATED: "list_updated",
  LIST_DELETED: "list_deleted",
  COLLABORATOR_ADDED: "collaborator_added",
  COLLABORATOR_REMOVED: "collaborator_removed",
  PROFILE_IMPORT: "profile_import",
  CLAIM_GENERATED: "claim_generated",
  CLAIM_CONSUMED: "claim_consumed",
  PASSKEY_DELETED: "passkey_deleted",
} as const;

export type ListTypeEnum = (typeof ListType)[keyof typeof ListType];
export type ContentTypeEnum = (typeof ContentType)[keyof typeof ContentType];
export type WatchStatusEnum = (typeof WatchStatus)[keyof typeof WatchStatus];
export type MovieWatchStatusEnum =
  (typeof MovieWatchStatus)[keyof typeof MovieWatchStatus];
export type TVWatchStatusEnum =
  (typeof TVWatchStatus)[keyof typeof TVWatchStatus];
export type PermissionLevelEnum =
  (typeof PermissionLevel)[keyof typeof PermissionLevel];
// Unreferenced today, kept for the same reason as the $inferSelect/$inferInsert
// pairs above: one derived type per `as const` object, so a missing one reads as
// an oversight and gets re-added the first time someone types an activity.
export type ActivityTypeEnum = (typeof ActivityType)[keyof typeof ActivityType];
