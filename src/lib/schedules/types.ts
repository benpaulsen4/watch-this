export interface ScheduleItem {
  id: string;
  tmdbId: number;
  createdAt: string;
  title: string | null;
}

export type SchedulesByDay = Record<number, ScheduleItem[]>;

export interface GetSchedulesResponse {
  schedules: SchedulesByDay;
  totalShows: number;
}

export interface CreateScheduleInput {
  tmdbId: number;
  dayOfWeek: number;
}

export interface DeleteSchedulesResponse {
  message: string;
  deletedSchedules: Array<{
    id: string;
    tmdbId: number;
    dayOfWeek: number;
    createdAt: string;
  }>;
}
