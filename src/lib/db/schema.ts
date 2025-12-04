import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  bigint,
  unique,
  jsonb,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Users table
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: varchar("username", { length: 50 }).notNull().unique(),
  profilePictureUrl: varchar("profile_picture_url", { length: 500 }),
  timezone: varchar("timezone", { length: 100 }).notNull().default("UTC"),
  country: varchar("country", { length: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Passkey credentials table
export const passkeyCredentials = pgTable("passkey_credentials", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  credentialId: varchar("credential_id", { length: 255 }).notNull().unique(),
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
});

// Lists table
export const lists = pgTable("lists", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  listType: varchar("list_type", { length: 20 }).default("mixed").notNull(),
  isPublic: boolean("is_public").default(false).notNull(),
  syncWatchStatus: boolean("sync_watch_status").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

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
  (table) => [unique().on(table.listId, table.userId)],
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
    title: varchar("title", { length: 255 }).notNull(),
    posterPath: varchar("poster_path", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [unique().on(table.listId, table.tmdbId, table.contentType)],
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
export const activityFeed = pgTable("activity_feed", {
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
});

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
  (table) => [unique().on(table.userId, table.tmdbId, table.dayOfWeek)],
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

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  passkeyCredentials: many(passkeyCredentials),
  passkeyClaims: many(passkeyClaims),
  ownedLists: many(lists),
  collaborations: many(listCollaborators),
  contentStatuses: many(userContentStatus),
  episodeStatuses: many(episodeWatchStatus),
  activities: many(activityFeed),
  showSchedules: many(showSchedules),
  streamingProviders: many(userStreamingProviders),
}));

export const passkeyCredentialsRelations = relations(
  passkeyCredentials,
  ({ one }) => ({
    user: one(users, {
      fields: [passkeyCredentials.userId],
      references: [users.id],
    }),
  }),
);

export const listsRelations = relations(lists, ({ one, many }) => ({
  owner: one(users, {
    fields: [lists.ownerId],
    references: [users.id],
  }),
  collaborators: many(listCollaborators),
  items: many(listItems),
  activities: many(activityFeed),
}));

export const listCollaboratorsRelations = relations(
  listCollaborators,
  ({ one }) => ({
    list: one(lists, {
      fields: [listCollaborators.listId],
      references: [lists.id],
    }),
    user: one(users, {
      fields: [listCollaborators.userId],
      references: [users.id],
    }),
  }),
);

export const listItemsRelations = relations(listItems, ({ one }) => ({
  list: one(lists, {
    fields: [listItems.listId],
    references: [lists.id],
  }),
}));

export const userContentStatusRelations = relations(
  userContentStatus,
  ({ one }) => ({
    user: one(users, {
      fields: [userContentStatus.userId],
      references: [users.id],
    }),
  }),
);

export const episodeWatchStatusRelations = relations(
  episodeWatchStatus,
  ({ one }) => ({
    user: one(users, {
      fields: [episodeWatchStatus.userId],
      references: [users.id],
    }),
  }),
);

export const activityFeedRelations = relations(activityFeed, ({ one }) => ({
  user: one(users, {
    fields: [activityFeed.userId],
    references: [users.id],
  }),
  list: one(lists, {
    fields: [activityFeed.listId],
    references: [lists.id],
  }),
}));

export const passkeyClaimsRelations = relations(passkeyClaims, ({ one }) => ({
  user: one(users, {
    fields: [passkeyClaims.userId],
    references: [users.id],
  }),
}));

export const showSchedulesRelations = relations(showSchedules, ({ one }) => ({
  user: one(users, {
    fields: [showSchedules.userId],
    references: [users.id],
  }),
}));

export const userStreamingProvidersRelations = relations(
  userStreamingProviders,
  ({ one }) => ({
    user: one(users, {
      fields: [userStreamingProviders.userId],
      references: [users.id],
    }),
  }),
);

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
export type ActivityTypeEnum = (typeof ActivityType)[keyof typeof ActivityType];
