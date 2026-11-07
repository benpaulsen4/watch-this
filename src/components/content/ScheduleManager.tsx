"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock,Plus, X } from "lucide-react";
import { useMemo,useState } from "react";

import { api, errorMessage } from "@/lib/api/client";
import { WatchStatusEnum } from "@/lib/db/schema";
import {
  addSchedule,
  getSchedules,
  removeSchedules,
} from "@/lib/schedules/contract";
import { GetSchedulesResponse, SchedulesByDay } from "@/lib/schedules/types";
import { cn } from "@/lib/utils";

import { Button } from "../ui/Button";
import { LoadingSpinner } from "../ui/LoadingSpinner";

interface ScheduleManagerProps {
  tmdbId: number;
  watchStatus: WatchStatusEnum;
}

export const DAYS_OF_WEEK = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function ScheduleManager({ tmdbId, watchStatus }: ScheduleManagerProps) {
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const schedulesQuery = useQuery<GetSchedulesResponse>({
    queryKey: ["schedules"],
    queryFn: ({ signal }) => api(getSchedules, {}, { signal }),
  });

  function computeOtherShowsByDay(
    schedulesByDay: SchedulesByDay,
    excludeTmdbId: number,
  ): Record<number, string[]> {
    const result: Record<number, string[]> = {};
    for (let day = 0; day <= 6; day++) {
      result[day] = (schedulesByDay[day] || [])
        .filter((s) => s.tmdbId !== excludeTmdbId)
        .map((s) => s.title)
        .filter((n): n is string => Boolean(n));
    }
    return result;
  }

  const schedulesByDay = useMemo(
    () => schedulesQuery.data?.schedules || ({} as SchedulesByDay),
    [schedulesQuery.data],
  );
  const otherShowsByDay = useMemo(
    () => computeOtherShowsByDay(schedulesByDay, tmdbId),
    [schedulesByDay, tmdbId],
  );

  // React Query handles loading/fetching; derived values computed via useMemo

  const addToScheduleMutation = useMutation({
    mutationFn: (dayOfWeek: number) =>
      api(addSchedule, { body: { tmdbId, dayOfWeek } }),
    onSuccess: (newItem, dayOfWeek) => {
      queryClient.setQueryData<GetSchedulesResponse>(["schedules"], (prev) => {
        const current = prev?.schedules || ({} as SchedulesByDay);
        const updatedDay = [...(current[dayOfWeek] || []), newItem];
        return {
          schedules: { ...current, [dayOfWeek]: updatedDay },
          totalShows: (prev?.totalShows ?? 0) + 1,
        };
      });
    },
    onError: (err: unknown) => {
      setError(errorMessage(err, "Failed to add to schedule"));
    },
  });

  const removeFromScheduleMutation = useMutation({
    mutationFn: (dayOfWeek: number) =>
      api(removeSchedules, { query: { tmdbId, dayOfWeek } }),
    onSuccess: (result, dayOfWeek) => {
      queryClient.setQueryData<GetSchedulesResponse>(["schedules"], (prev) => {
        const current = prev?.schedules || ({} as SchedulesByDay);
        const updatedDay = (current[dayOfWeek] || []).filter(
          (s) => s.tmdbId !== tmdbId,
        );
        return {
          schedules: { ...current, [dayOfWeek]: updatedDay },
          totalShows: Math.max(
            (prev?.totalShows ?? 0) - result.deletedSchedules.length,
            0,
          ),
        };
      });
    },
    onError: (err: unknown) => {
      setError(errorMessage(err, "Failed to remove from schedule"));
    },
  });

  // Don't allow scheduling for completed or dropped shows
  if (watchStatus === "completed" || watchStatus === "dropped") {
    return (
      <div className="text-center py-8">
        <Clock className="h-12 w-12 text-gray-500 mx-auto mb-4" />
        <p className="text-gray-400">
          Only shows that are planning, watching, or paused can be scheduled.
        </p>
      </div>
    );
  }

  if (schedulesQuery.isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <LoadingSpinner size="lg" text="Loading schedule..." />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-100">Weekly Schedule</h3>

      {error && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-3 mb-4">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      <p className="text-gray-400 text-sm mb-6">
        Schedule this show for specific days of the week. You&apos;ll get
        suggestions to watch the next episode on scheduled days.
      </p>

      <div className="grid gap-3">
        {DAYS_OF_WEEK.map((day, index) => {
          const isScheduled = (schedulesByDay[index] || []).some(
            (s) => s.tmdbId === tmdbId,
          );
          const today = new Date().getDay();
          const isToday = index === today;

          return (
            <div
              key={day}
              className={cn(
                "flex items-center justify-between p-4 rounded-lg border transition-colors, gap-2",
                isToday
                  ? "bg-red-900/20 border-red-800"
                  : "bg-gray-800/50 border-gray-700",
              )}
            >
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "w-3 h-3 rounded-full",
                      isScheduled ? "bg-red-500" : "bg-gray-600",
                    )}
                  />
                  <span
                    className={cn(
                      "font-medium",
                      isToday ? "text-red-400" : "text-gray-200",
                    )}
                  >
                    {day}
                    {isToday && (
                      <span className="ml-2 text-xs bg-red-500 text-white px-2 py-0.5 rounded-full">
                        Today
                      </span>
                    )}
                  </span>
                </div>
                {otherShowsByDay[index] &&
                  otherShowsByDay[index].length > 0 && (
                    <>
                      <span className="hidden md:inline ml-2 text-xs text-gray-400">
                        Also scheduled: {otherShowsByDay[index].join(", ")}
                      </span>
                      <div className="md:hidden pl-6 text-xs text-gray-400">
                        Also scheduled: {otherShowsByDay[index].join(", ")}
                      </div>
                    </>
                  )}
              </div>

              <Button
                onClick={() =>
                  isScheduled
                    ? removeFromScheduleMutation.mutate(index)
                    : addToScheduleMutation.mutate(index)
                }
                variant={isScheduled ? "destructive" : "secondary"}
              >
                {isScheduled ? (
                  <>
                    <X className="h-5 w-5 mr-2" />
                    Remove
                  </>
                ) : (
                  <>
                    <Plus className="h-5 w-5 mr-2" />
                    Add
                  </>
                )}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
