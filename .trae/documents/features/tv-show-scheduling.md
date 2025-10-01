# TV Show Scheduling Feature

## Overview

The TV Show Scheduling feature allows users to assign specific days of the week to their TV shows, enabling proactive episode tracking and reducing the friction of marking episodes as watched. Users will receive suggested activities on scheduled days to mark the next episode as watched.

## User Stories

### Primary User Stories

* **As a user**, I want to assign specific days of the week to my TV shows so that I can be reminded to watch them on those days

* **As a user**, I want to see upcoming activities for shows scheduled for today so that I can quickly mark episodes as watched

* **As a user**, I want to manage my show schedules from the content details modal so that I can easily add/remove scheduling

* **As a user**, I want shows to be automatically removed from my schedule when completed or dropped so that I don't see irrelevant suggestions

### Secondary User Stories

* **As a user**, I want to assign multiple days to a single show so that I can accommodate flexible viewing schedules

* **As a user**, I want to see which shows are scheduled for each day of the week so that I can plan my viewing

* **As a user**, I want upcoming activities to disappear after I've watched today's episode so that I don't get duplicate suggestions

## Technical Requirements

### Database Schema

```sql
-- New table for show schedules
CREATE TABLE show_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tmdb_id INTEGER NOT NULL,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0 = Sunday, 6 = Saturday
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, tmdb_id, day_of_week)
);

-- Index for efficient querying
CREATE INDEX idx_show_schedules_user_day ON show_schedules(user_id, day_of_week);
CREATE INDEX idx_show_schedules_user_tmdb ON show_schedules(user_id, tmdb_id);
```

### API Endpoints

#### Schedule Management

* `GET /api/schedules` - Get user's show schedules

* `POST /api/schedules` - Add show to schedule

* `DELETE /api/schedules` - Remove show from schedule

#### Activity Enhancement

* `GET /api/activity` - Enhanced to include `upcoming` array with scheduled shows for today

### Component Updates

#### ContentDetailsModal

* Add new "Schedule" tab for TV shows only

* Display current schedule for the show

* Allow adding/removing days from schedule

* Show weekly schedule overview

#### ActivityFeed

* Display upcoming activity cards for scheduled shows

* Include poster, show name, and "Mark Next Episode" CTA

* Hide shows that have been watched today

## User Interface Design

### Schedule Tab in Content Details Modal

```
┌─────────────────────────────────────────┐
│ [Overview] [Episodes] [Lists] [Schedule] │
├─────────────────────────────────────────┤
│ Current Schedule:                        │
│ ☑ Monday    ☐ Tuesday   ☐ Wednesday     │
│ ☐ Thursday  ☑ Friday    ☐ Saturday      │
│ ☐ Sunday                                │
│                                         │
│ Weekly Schedule Overview:               │
│ Monday:    • Show A • Show B            │
│ Tuesday:   • Show C                     │
│ Wednesday: (No shows)                   │
│ ...                                     │
└─────────────────────────────────────────┘
```

### Upcoming Activities in Activity Feed

```
┌─────────────────────────────────────────┐
│ Upcoming Activities                     │
├─────────────────────────────────────────┤
│ ┌─────┐ Breaking Bad                    │
│ │[IMG]│ Ready for next episode          │
│ │     │ [Mark Next Episode Watched]     │
│ └─────┘                                 │
│                                         │
│ ┌─────┐ The Office                      │
│ │[IMG]│ Scheduled for today             │
│ │     │ [Mark Next Episode Watched]     │
│ └─────┘                                 │
└─────────────────────────────────────────┘
```

## Business Logic

### Schedule Assignment

* Users can assign 0-7 days to any TV show

* Multiple shows can be scheduled for the same day

* Schedules persist until manually removed or auto-removed

### Auto-Removal Triggers

* Show status changed to "completed"

* Show status changed to "dropped"

* Final episode of show marked as watched (triggers completion)

### Upcoming Activity Logic

* Show appears in upcoming if:

  * Scheduled for current day of week (0-6, Monday-Sunday)

  * User hasn't watched an episode today

  * Show status is "watching" or "play"

* Show disappears from upcoming if:

  * User marks any episode as watched today

  * Show is removed from schedule

  * Show status changes to completed/dropped

### Episode Tracking Integration

* Leverage existing `/api/status/episodes/next` endpoint

* Track last watched date to prevent duplicate suggestions

* Update show status automatically when final episode watched

## Implementation Phases

### Phase 1: Database & Core API

1. Create show\_schedules table migration
2. Implement schedule management API endpoints
3. Add schedule data to user queries

### Phase 2: UI Components

1. Add Schedule tab to ContentDetailsModal
2. Implement day-of-week selector component
3. Add schedule overview display

### Phase 3: Activity Integration

1. Enhance activity API with upcoming activities
2. Add upcoming activity cards to ActivityFeed
3. Implement "Mark Next Episode" functionality

### Phase 4: Auto-Management

1. Add schedule removal on status changes
2. Implement daily activity filtering
3. Add comprehensive error handling

## Success Metrics

* Increased episode tracking engagement

* Reduced time to mark episodes as watched

* User retention for TV show tracking

* Reduced navigation to find shows for episode updates

## Future Enhancements

* Custom notification times for scheduled shows

* Integration with calendar applications

* Batch episode marking for binge sessions

* Smart scheduling based on viewing patterns

