# Data Import/Export Feature

## Overview

The Data Import/Export feature allows WatchThis users to backup, migrate, and restore their personal data including lists, watchlist data, content watch status, and episode progress tracking. This feature supports JSON format for complete data preservation and CSV format for external data transfer, providing flexibility for different use cases including data portability, backup creation, and migration between accounts or platforms.

## Product Requirements

### User Stories

**As a user, I want to:**
- Export all my lists, items, content status, and episode progress to backup my data
- Import previously exported JSON data to restore my complete profile
- Export data in CSV format for external analysis and data transfer
- Receive clear feedback about import success/failures with detailed statistics
- Understand what data will be exported/imported including activity feed updates
- See activity feed entries when imports are completed successfully

### Functional Requirements

#### Export Functionality
- **FR-1**: Users can export all their lists and associated items
- **FR-2**: Users can export all content watch status for movies and TV shows
- **FR-3**: Users can export all episode watch progress for TV shows
- **FR-4**: Export supports JSON format for complete data structure preservation
- **FR-5**: Export supports CSV format as ZIP archive with separate files for each data table
- **FR-6**: Exported files include user metadata and timestamp
- **FR-7**: File downloads are automatically named with username and date
- **FR-8**: Export includes all list metadata (name, description, type, visibility)
- **FR-9**: Export includes all item metadata (title, TMDB ID, content type, notes, sort order)
- **FR-10**: Export includes content status metadata (status, next episode date, timestamps)
- **FR-11**: Export includes episode watch status metadata (season, episode, watched status, timestamps)

#### Import Functionality
- **FR-12**: Users can import JSON files exported from WatchThis
- **FR-13**: Import validates file format and structure before processing
- **FR-14**: Import provides detailed feedback on success/failure status with counts
- **FR-15**: Import handles partial failures gracefully (continues processing valid data)
- **FR-16**: Import adds to existing data rather than replacing it
- **FR-17**: Import processes lists, list items, content status, and episode watch status
- **FR-18**: Import generates activity feed entry with import statistics upon completion
- **FR-19**: CSV format is export-only for external data transfer (no CSV import support)

### Non-Functional Requirements

- **NFR-1**: Export operations complete within 30 seconds for typical user data
- **NFR-2**: Import operations handle files up to 10MB in size
- **NFR-3**: All operations are authenticated and user-scoped
- **NFR-4**: Data integrity is maintained during import/export operations
- **NFR-5**: Error handling provides meaningful feedback to users

## Technical Architecture

### System Components

#### Backend API Endpoints

**Export Endpoint**: `GET /api/profile/export`
- **File**: `src/app/api/profile/export/route.ts`
- **Authentication**: Protected with `withAuth` middleware
- **Parameters**: `format` query parameter ("json" | "csv")
- **Response**: 
  - JSON format: JSON object containing complete user data and suggested filename
  - CSV format: ZIP file containing separate CSV files for each data table

**Import Endpoint**: `POST /api/profile/import`
- **File**: `src/app/api/profile/import/route.ts`
- **Authentication**: Protected with `withAuth` middleware
- **Input**: FormData with JSON file only
- **Response**: Import result with success status, detailed counts, error details, and activity feed entry ID

#### Frontend Component

**DataExportImport Component**: `src/components/profile/DataExportImport.tsx`
- **Type**: Client component with React state management
- **Features**: File upload (JSON only), CSV/JSON export options, progress indication, detailed result display
- **UI Framework**: Tailwind CSS with custom Card and Button components
- **Import Support**: JSON files only with comprehensive data validation
- **Export Options**: JSON for backup/restore, CSV ZIP for external analysis

### Data Flow

#### Export Process

1. **User Initiation**: User clicks export button (JSON or CSV)
2. **API Request**: Frontend calls `/api/profile/export?format={format}`
3. **Authentication**: Middleware validates user session
4. **Data Retrieval**: 
   - Query user's lists with LEFT JOIN to list items
   - Query user's content status for all movies and TV shows
   - Query user's episode watch status for all TV shows
   - Order by creation dates and sort orders
5. **Format Processing**:
   - **JSON**: Create structured object with metadata, lists, content status, and episode progress
   - **CSV**: Create separate CSV files for each data table, package into ZIP archive
6. **Response**: Return formatted data with suggested filename
7. **Download**: Frontend creates blob and triggers browser download

#### Import Process

1. **File Selection**: User selects JSON file via file input
2. **Upload Initiation**: User clicks import button
3. **API Request**: FormData sent to `/api/profile/import`
4. **File Processing**: Parse and validate JSON structure
5. **Data Validation**: Check required fields for lists, items, content status, and episodes
6. **Database Operations**:
   - Create lists with user as owner
   - Insert list items with proper relationships
   - Create/update content status entries
   - Create/update episode watch status entries
   - Handle errors gracefully and continue processing
7. **Activity Feed**: Create activity entry with import statistics
8. **Response**: Return success counts, detailed error list, and activity entry ID
9. **UI Feedback**: Display results with success/error indicators and import statistics

### Database Schema Integration

#### Tables Involved

**Lists Table** (`lists`):
- `id`: Primary key
- `ownerId`: Foreign key to user
- `name`: List name (required)
- `description`: Optional description
- `listType`: Type of content ("movie", "tv", "mixed")
- `isPublic`: Visibility flag
- `createdAt`: Timestamp

**List Items Table** (`listItems`):
- `id`: Primary key
- `listId`: Foreign key to lists
- `tmdbId`: TMDB identifier
- `contentType`: Content type ("movie" | "tv")
- `title`: Display title
- `posterPath`: Image URL
- `notes`: User notes
- `addedAt`: Timestamp
- `sortOrder`: Display order

**User Content Status Table** (`userContentStatus`):
- `id`: Primary key
- `userId`: Foreign key to user
- `tmdbId`: TMDB identifier
- `contentType`: Content type ("movie" | "tv")
- `status`: Watch status ("planning", "watching", "paused", "completed", "dropped")
- `nextEpisodeDate`: Next episode air date for TV shows
- `updatedAt`: Last update timestamp
- `createdAt`: Creation timestamp

**Episode Watch Status Table** (`episodeWatchStatus`):
- `id`: Primary key
- `userId`: Foreign key to user
- `tmdbId`: TMDB identifier for TV show
- `seasonNumber`: Season number
- `episodeNumber`: Episode number
- `watched`: Boolean watch status
- `watchedAt`: Timestamp when marked as watched
- `createdAt`: Creation timestamp
- `updatedAt`: Last update timestamp

**Activity Feed Table** (`activityFeed`):
- `id`: Primary key
- `userId`: Foreign key to user
- `activityType`: Type of activity
- `tmdbId`: Optional TMDB identifier
- `contentType`: Optional content type
- `listId`: Optional foreign key to lists
- `metadata`: JSON metadata for activity details
- `collaborators`: Array of collaborator user IDs
- `isCollaborative`: Boolean flag for collaborative activities
- `createdAt`: Creation timestamp

### Data Formats

#### JSON Export Structure

```json
{
  "exportedAt": "2024-01-15T10:30:00.000Z",
  "user": {
    "username": "user123"
  },
  "lists": [
    {
      "id": "list-uuid",
      "name": "My Watchlist",
      "description": "Movies to watch",
      "type": "movie",
      "isPublic": false,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "items": [
        {
          "id": "item-uuid",
          "tmdbId": 12345,
          "contentType": "movie",
          "title": "Example Movie",
          "posterPath": "/poster.jpg",
          "notes": "Recommended by friend",
          "addedAt": "2024-01-02T00:00:00.000Z",
          "sortOrder": 1
        }
      ]
    }
  ],
  "contentStatus": [
    {
      "id": "status-uuid",
      "tmdbId": 12345,
      "contentType": "movie",
      "status": "completed",
      "nextEpisodeDate": null,
      "updatedAt": "2024-01-10T15:30:00.000Z",
      "createdAt": "2024-01-05T12:00:00.000Z"
    },
    {
      "id": "status-uuid-2",
      "tmdbId": 67890,
      "contentType": "tv",
      "status": "watching",
      "nextEpisodeDate": "2024-01-20T20:00:00.000Z",
      "updatedAt": "2024-01-12T18:45:00.000Z",
      "createdAt": "2024-01-08T14:20:00.000Z"
    }
  ],
  "episodeWatchStatus": [
    {
      "id": "episode-uuid",
      "tmdbId": 67890,
      "seasonNumber": 1,
      "episodeNumber": 1,
      "watched": true,
      "watchedAt": "2024-01-08T21:30:00.000Z",
      "createdAt": "2024-01-08T21:30:00.000Z",
      "updatedAt": "2024-01-08T21:30:00.000Z"
    },
    {
      "id": "episode-uuid-2",
      "tmdbId": 67890,
      "seasonNumber": 1,
      "episodeNumber": 2,
      "watched": true,
      "watchedAt": "2024-01-09T20:15:00.000Z",
      "createdAt": "2024-01-09T20:15:00.000Z",
      "updatedAt": "2024-01-09T20:15:00.000Z"
    }
  ]
}
```

#### CSV Export Structure (ZIP Archive)

The CSV export creates a ZIP file containing separate CSV files for each data table:

**lists.csv**:
```csv
ID,Owner ID,Name,Description,List Type,Is Public,Created At
"list-uuid","user-uuid","My Watchlist","Movies to watch","movie","false","2024-01-01T00:00:00.000Z"
```

**list_items.csv**:
```csv
ID,List ID,TMDB ID,Content Type,Title,Poster Path,Notes,Added At,Sort Order
"item-uuid","list-uuid","12345","movie","Example Movie","/poster.jpg","Recommended by friend","2024-01-02T00:00:00.000Z","1"
```

**content_status.csv**:
```csv
ID,User ID,TMDB ID,Content Type,Status,Next Episode Date,Updated At,Created At
"status-uuid","user-uuid","12345","movie","completed","","2024-01-10T15:30:00.000Z","2024-01-05T12:00:00.000Z"
"status-uuid-2","user-uuid","67890","tv","watching","2024-01-20T20:00:00.000Z","2024-01-12T18:45:00.000Z","2024-01-08T14:20:00.000Z"
```

**episode_watch_status.csv**:
```csv
ID,User ID,TMDB ID,Season Number,Episode Number,Watched,Watched At,Created At,Updated At
"episode-uuid","user-uuid","67890","1","1","true","2024-01-08T21:30:00.000Z","2024-01-08T21:30:00.000Z","2024-01-08T21:30:00.000Z"
"episode-uuid-2","user-uuid","67890","1","2","true","2024-01-09T20:15:00.000Z","2024-01-09T20:15:00.000Z","2024-01-09T20:15:00.000Z"
```

### Security Considerations

- **Authentication**: All endpoints require valid user session
- **Authorization**: Users can only export/import their own data
- **Input Validation**: File format and structure validation
- **File Size Limits**: Reasonable limits to prevent abuse
- **Error Handling**: No sensitive information leaked in error messages

### Error Handling

#### Export Errors
- Invalid format parameter
- Database query failures for lists, content status, or episode data
- File generation errors
- ZIP archive creation failures (CSV format)

#### Import Errors
- Missing or invalid JSON file
- Malformed JSON data structure
- Missing required fields in lists, content status, or episode data
- Database constraint violations
- Individual item/list/status creation failures
- Activity feed entry creation failures

### Performance Considerations

- **Database Queries**: Optimized queries with JOINs for lists, separate queries for content status and episode data
- **Memory Usage**: Streaming approach for large datasets, especially for users with extensive episode watch history
- **File Processing**: Efficient JSON parsing and ZIP archive creation for CSV exports
- **Error Recovery**: Continue processing after individual failures across all data types
- **Activity Feed**: Batch activity creation to minimize database overhead during imports
- **ZIP Compression**: Efficient compression for CSV exports with multiple data tables

### Future Enhancements

1. **Incremental Export**: Export only data modified since last export
2. **Selective Import**: Allow users to choose which data types to import (lists, status, episodes)
3. **Data Transformation**: Support for importing from other platforms (Trakt, MyAnimeList, etc.)
4. **Advanced Compression**: Support for additional compression formats
5. **Scheduling**: Automated periodic exports with cloud storage integration
6. **Conflict Resolution**: Handle duplicate detection and merge strategies during import
7. **Import Preview**: Show preview of data to be imported before processing
8. **Partial Exports**: Export specific lists or date ranges

## Implementation Notes

### Code Architecture Compliance

- **Server Components**: API routes are server-side with proper authentication
- **Client Components**: UI component marked with 'use client' directive
- **Authentication Middleware**: Uses `withAuth` wrapper for API protection
- **Database Access**: Uses Drizzle ORM for type-safe database operations
- **Error Handling**: Consistent error response format across endpoints
- **TypeScript**: Full type safety with proper interfaces

### UI/UX Design

- **Responsive Design**: Mobile-first approach with Tailwind CSS
- **Loading States**: Clear feedback during export/import operations with progress indicators
- **Error Display**: Detailed error reporting with user-friendly messages and import statistics
- **File Handling**: Drag-and-drop support for JSON files
- **Export Options**: Clear distinction between JSON (backup) and CSV (analysis) formats
- **Import Results**: Comprehensive display of imported counts for lists, items, content status, and episodes
- **Activity Integration**: Link to activity feed entry created during import
- **Accessibility**: Proper ARIA labels and keyboard navigation

### Testing Considerations

- **Unit Tests**: Test data transformation logic for all data types
- **Integration Tests**: Test full export/import workflows including activity feed creation
- **Error Scenarios**: Test various failure modes across lists, content status, and episode data
- **File Format Tests**: Validate JSON processing and CSV ZIP archive creation
- **Performance Tests**: Test with large datasets including extensive episode watch history
- **Data Integrity**: Verify correct import of all data types with proper relationships
- **Activity Feed**: Test activity entry creation with accurate import statistics

This feature provides a robust foundation for data portability in WatchThis, enabling users to maintain control over their data while supporting various backup and migration scenarios.