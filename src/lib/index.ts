// Database utilities
export {
  users,
  passkeyCredentials,
  lists,
  listCollaborators,
  listItems,
  userContentStatus,
  usersRelations,
  passkeyCredentialsRelations,
  listsRelations,
  listCollaboratorsRelations,
  listItemsRelations,
  userContentStatusRelations,
  ListType,
  WatchStatus,
  PermissionLevel,
  db
} from './db';
export type {
  User,
  NewUser,
  PasskeyCredential,
  NewPasskeyCredential,
  List,
  NewList,
  ListCollaborator,
  NewListCollaborator,
  ListItem,
  NewListItem,
  UserContentStatus,
  NewUserContentStatus,
  ListTypeEnum,
  ContentTypeEnum,
  WatchStatusEnum,
  PermissionLevelEnum,
  ContentType as DBContentType
} from './db';

// Authentication utilities
export * from './auth';

// TMDB API utilities
export {
  tmdbClient
} from './tmdb';
export type {
  TMDBMovie,
  TMDBTVShow,
  TMDBSearchResult,
  TMDBGenre,
  TMDBMovieDetails,
  TMDBTVShowDetails,
  ContentType as TMDBContentType
} from './tmdb';

// General utilities
export * from './utils';