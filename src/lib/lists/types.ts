import { TMDBContent } from "../content-status/types";
import { ContentTypeEnum, ListTypeEnum, PermissionLevelEnum } from "../db";

export interface ListItem extends TMDBContent {
  listItemId: string;
  createdAt: string;
}

export interface GetListResponse {
  id: string;
  name: string;
  description: string | null;
  listType: ListTypeEnum;
  isPublic: boolean;
  isArchived: boolean;
  syncWatchStatus: boolean;
  ownerId: string;
  ownerUsername: string;
  ownerProfilePictureUrl: string | null;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
  collaborators: number;
}

export interface GetListItemsResponse {
  items: ListItem[];
}

export interface ListListsResponse {
  id: string;
  name: string;
  description: string | null;
  listType: string;
  isPublic: boolean;
  isArchived: boolean;
  syncWatchStatus: boolean;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
  itemCount: number;
  collaborators: number;
  posterPaths: string[];
}

export interface CreateListInput {
  name: string;
  description?: string | null;
  listType?: ListTypeEnum;
  isPublic?: boolean;
  syncWatchStatus?: boolean;
}

export interface UpdateListInput {
  name?: string;
  description?: string | null;
  listType?: ListTypeEnum;
  isPublic?: boolean;
  isArchived?: boolean;
  syncWatchStatus?: boolean;
}

export interface DeleteResponse {
  message: string;
}

export interface CreateListItemInput {
  tmdbId: number;
  contentType: ContentTypeEnum;
}

export interface ListItemRow {
  id: string;
  listId: string;
  tmdbId: number;
  contentType: ContentTypeEnum;
  createdAt: string;
}

export interface Collaborator {
  id: string;
  userId: string;
  username: string;
  profilePictureUrl?: string | null;
  permissionLevel: PermissionLevelEnum;
  createdAt: string;
}

export interface CreateCollaboratorInput {
  username: string;
  permissionLevel: PermissionLevelEnum;
}

export interface UpdateCollaboratorInput {
  permissionLevel: PermissionLevelEnum;
}

export interface ListCollaboratorsResponse {
  collaborators: Collaborator[];
}

export interface UpdateCollaboratorsResponse {
  collaborator: Collaborator;
  message: string;
}
