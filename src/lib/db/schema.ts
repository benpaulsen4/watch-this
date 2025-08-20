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
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Users table
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: varchar("username", { length: 50 }).notNull().unique(),
  profilePictureUrl: varchar("profile_picture_url", { length: 500 }),
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
    invitedAt: timestamp("invited_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
  },
  (table) => [unique().on(table.listId, table.userId)]
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
    notes: text("notes"),
    addedAt: timestamp("added_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (table) => [unique().on(table.listId, table.tmdbId, table.contentType)]
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
  (table) => [unique().on(table.userId, table.tmdbId, table.contentType)]
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
      table.episodeNumber
    ),
  ]
);

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  passkeyCredentials: many(passkeyCredentials),
  ownedLists: many(lists),
  collaborations: many(listCollaborators),
  contentStatuses: many(userContentStatus),
  episodeStatuses: many(episodeWatchStatus),
}));

export const passkeyCredentialsRelations = relations(
  passkeyCredentials,
  ({ one }) => ({
    user: one(users, {
      fields: [passkeyCredentials.userId],
      references: [users.id],
    }),
  })
);

export const listsRelations = relations(lists, ({ one, many }) => ({
  owner: one(users, {
    fields: [lists.ownerId],
    references: [users.id],
  }),
  collaborators: many(listCollaborators),
  items: many(listItems),
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
  })
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
  })
);

export const episodeWatchStatusRelations = relations(
  episodeWatchStatus,
  ({ one }) => ({
    user: one(users, {
      fields: [episodeWatchStatus.userId],
      references: [users.id],
    }),
  })
);

// Types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type PasskeyCredential = typeof passkeyCredentials.$inferSelect;
export type NewPasskeyCredential = typeof passkeyCredentials.$inferInsert;

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

// Enums for type safety
export const ListType = {
  MOVIE: "movie",
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

export type ListTypeEnum = (typeof ListType)[keyof typeof ListType];
export type ContentTypeEnum = (typeof ContentType)[keyof typeof ContentType];
export type WatchStatusEnum = (typeof WatchStatus)[keyof typeof WatchStatus];
export type MovieWatchStatusEnum =
  (typeof MovieWatchStatus)[keyof typeof MovieWatchStatus];
export type TVWatchStatusEnum =
  (typeof TVWatchStatus)[keyof typeof TVWatchStatus];
export type PermissionLevelEnum =
  (typeof PermissionLevel)[keyof typeof PermissionLevel];
