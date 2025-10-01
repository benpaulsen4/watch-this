'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, X, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LoadingSpinner } from './LoadingSpinner';
import { Button } from './Button';
import { WatchStatusEnum } from '@/lib/db/schema';

interface ScheduleManagerProps {
  tmdbId: number;
  watchStatus: WatchStatusEnum;
}

interface Schedule {
  id: string;
  tmdbId: number;
  dayOfWeek: number;
  createdAt: Date;
  title?: string | null;
}

export const DAYS_OF_WEEK = [
  'Sunday',
  'Monday', 
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday'
];

export function ScheduleManager({ tmdbId, watchStatus }: ScheduleManagerProps) {
  const [schedules, setSchedules] = useState<Record<number, Schedule[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [otherShowsByDay, setOtherShowsByDay] = useState<Record<number, string[]>>({});

  async function getSchedulesByDay(): Promise<Record<number, Schedule[]>> {
    const response = await fetch(`/api/schedules`);
    if (!response.ok) throw new Error('Failed to fetch schedules');
    const data = await response.json();
    return (data.schedules || {}) as Record<number, Schedule[]>;
  }

  function computeOtherShowsByDay(
    schedulesByDay: Record<number, Schedule[]>,
    excludeTmdbId: number
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

  const refreshOtherShows = useCallback(async (currentSchedules: Record<number, Schedule[]>) => {
    const otherByDay = computeOtherShowsByDay(currentSchedules, tmdbId);
    setOtherShowsByDay(otherByDay);
  }, [tmdbId]);

  // Initialize empty schedules for all days
  useEffect(() => {
    const emptySchedules: Record<number, Schedule[]> = {};
    const emptyOther: Record<number, string[]> = {};
    for (let day = 0; day <= 6; day++) {
      emptySchedules[day] = [];
      emptyOther[day] = [];
    }
    setSchedules(emptySchedules);
    setOtherShowsByDay(emptyOther);
  }, []);

  // Fetch all schedules for the user and compute other shows per day
  useEffect(() => {
    const fetchSchedules = async () => {
      try {
        setLoading(true);
        const schedulesByDay = await getSchedulesByDay();
        setSchedules(schedulesByDay);
        await refreshOtherShows(schedulesByDay);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch schedules');
      } finally {
        setLoading(false);
      }
    };

    fetchSchedules();
  }, [refreshOtherShows]);

  const addToSchedule = async (dayOfWeek: number) => {
    try {
      const response = await fetch('/api/schedules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tmdbId,
          dayOfWeek,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to add to schedule');
      }

      const newSchedule = await response.json();

      const updated = {
        ...schedules,
        [dayOfWeek]: [...(schedules[dayOfWeek] || []), newSchedule],
      } as Record<number, Schedule[]>;
      setSchedules(updated);
      await refreshOtherShows(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add to schedule');
    }
  };

  const removeFromSchedule = async (dayOfWeek: number) => {
    try {
      const response = await fetch(`/api/schedules?tmdbId=${tmdbId}&dayOfWeek=${dayOfWeek}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to remove from schedule');
      }

      const updated = {
        ...schedules,
        [dayOfWeek]: (schedules[dayOfWeek] || []).filter(s => s.tmdbId !== tmdbId),
      } as Record<number, Schedule[]>;
      setSchedules(updated);
      await refreshOtherShows(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove from schedule');
    }
  };

  // Don't allow scheduling for completed or dropped shows
  if (watchStatus === 'completed' || watchStatus === 'dropped') {
    return (
      <div className="text-center py-8">
        <Clock className="h-12 w-12 text-gray-500 mx-auto mb-4" />
        <p className="text-gray-400">
          Only shows that are planning, watching, or paused can be scheduled.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <LoadingSpinner variant="primary" text="Loading schedules..." />
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
        Schedule this show for specific days of the week. You&apos;ll get suggestions to watch the next episode on scheduled days.
      </p>

      <div className="grid gap-3">
        {DAYS_OF_WEEK.map((day, index) => {
          const isScheduled = (schedules[index] || []).some(s => s.tmdbId === tmdbId);
          const today = new Date().getDay();
          const isToday = index === today;

          return (
            <div
              key={day}
              className={cn(
                "flex items-center justify-between p-4 rounded-lg border transition-colors, gap-2",
                isToday 
                  ? "bg-red-900/20 border-red-800" 
                  : "bg-gray-800/50 border-gray-700"
              )}
            >
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-3 h-3 rounded-full",
                    isScheduled ? "bg-red-500" : "bg-gray-600"
                  )} />
                    <span className={cn(
                      "font-medium",
                      isToday ? "text-red-400" : "text-gray-200"
                    )}>
                      {day}
                      {isToday && (
                        <span className="ml-2 text-xs bg-red-500 text-white px-2 py-0.5 rounded-full">
                          Today
                        </span>
                      )}
                    </span>
                  </div>
                  {otherShowsByDay[index] && otherShowsByDay[index].length > 0 && (
                    <>
                      <span className="hidden md:inline ml-2 text-xs text-gray-400">
                        Also scheduled: {otherShowsByDay[index].join(', ')}
                      </span>
                      <div className="md:hidden pl-6 text-xs text-gray-400">
                        Also scheduled: {otherShowsByDay[index].join(', ')}
                      </div>
                    </>
                  )}
                </div>

              <Button
                onClick={() => isScheduled ? removeFromSchedule(index) : addToSchedule(index)}
                variant={isScheduled ? 'destructive' : 'secondary'}
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