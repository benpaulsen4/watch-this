import { TMDBContent } from "../content-status/types";

export interface ActivityUser {
  id: string;
  username: string;
  profilePictureUrl?: string | null;
}

export interface ActivityItem {
  id: string;
  activityType: string;
  user: ActivityUser;
  tmdbId?: number;
  contentType?: string;
  listId?: string;
  metadata?: Record<string, unknown>;
  isCollaborative: boolean;
  collaborators?: ActivityUser[];
  createdAt: string;
}

export interface UpcomingActivity extends TMDBContent {
  scheduleId: string;
}

export interface ActivityTimelineResponse {
  activities: ActivityItem[];
  upcoming: UpcomingActivity[];
  hasMore: boolean;
  nextCursor: string | null;
}

export interface ListActivityInput {
  limit: number;
  cursor?: string;
  type?: string;
}
