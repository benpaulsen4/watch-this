# Search & Content Discovery Feature

## Feature Overview

The Search & Content Discovery system enables users to find movies and TV shows through TMDB integration. The current implementation provides basic search functionality, content discovery through trending content, and detailed content information with user interaction capabilities including watch status tracking and list management.

## Current Implementation Status

### Implemented Features
- **Text Search**: Basic search functionality for movies and TV shows by title
- **Content Discovery**: Trending content display (daily/weekly)
- **Content Filtering**: Basic filtering by content type, genre, year, and sorting
- **Content Details**: Detailed modal views with comprehensive content information
- **Watch Status**: Track watching status (watching, completed, planned, dropped)
- **List Management**: Add/remove content from user lists
- **Episode Tracking**: Track watched episodes for TV shows

### User Stories (Current Implementation)
- **As a content seeker**, I can search for movies and TV shows by title to find specific content
- **As a discovery user**, I can browse trending content to find popular movies and TV shows
- **As a filter user**, I can filter content by type, genre, year, and sort by different criteria
- **As a list builder**, I can add discovered content to my watchlists and manage my collections
- **As a tracker**, I can mark my watch status and track episode progress for TV shows
- **As a detail viewer**, I can view comprehensive content information including ratings, overview, and genres

### Search Types & Methods (Current)

#### Text Search
- **Search Input**: Debounced search input with loading states
- **Multi-type Search**: Search across movies and TV shows simultaneously
- **Year Filtering**: Optional year filtering for specific content types

#### Discovery Methods
- **Trending Content**: Daily and weekly trending content from TMDB
- **Discover Content**: Browse content with filtering and sorting options
- **Genre Filtering**: Filter content by specific genres

#### Current Filtering Options
| Filter Category | Implementation |
|----------------|----------------|
| **Content Type** | All, Movies, TV Shows |
| **Genre** | Dropdown selection from TMDB genres |
| **Release Year** | Dropdown selection (last 50 years) |
| **Sort By** | Popularity, Rating, Release Date, Title |

### Acceptance Criteria (Current)

#### Search Functionality
- ✅ Search with debounced input (500ms delay)
- ✅ Search across movies and TV shows
- ✅ Year filtering for specific content types
- ✅ Loading states during search operations
- ✅ Clear search functionality

#### Content Discovery
- ✅ Trending content from TMDB (day/week options)
- ✅ Genre-based filtering
- ✅ Sort by popularity, rating, release date, title
- ✅ Load more functionality for discover content

#### Results & Display
- ✅ Content cards with poster, title, year, rating, and type
- ✅ Watch status badges on content cards
- ✅ Detailed modal views with comprehensive information
- ✅ Episode tracking for TV shows
- ✅ List management integration

#### User Interactions
- ✅ Click to view detailed content information
- ✅ Update watch status directly from content cards or modals
- ✅ Add/remove content from lists
- ✅ Track episode progress for TV shows

### User Experience Flow (Current)

1. **Dashboard Discovery**:
   - User views trending content on dashboard
   - Clicks "Discover" to access full search interface
   - Views trending content in grid layout

2. **Search & Filter**:
   - User navigates to search page
   - Enters search query with debounced input
   - Applies filters for content type, genre, year, and sorting
   - Views filtered results in grid layout

3. **Content Interaction**:
   - User clicks on content card to view details
   - Views comprehensive information in modal
   - Updates watch status or adds to lists
   - Tracks episode progress for TV shows

## Technical Implementation

### Current Architecture

```mermaid
graph TD
    A[DashboardClient] --> B[Trending API]
    C[SearchClient] --> D[Search API]
    C --> E[Discover API]
    C --> F[Genres API]
    
    G[ContentCard] --> H[ContentDetailsModal]
    H --> I[Details API]
    H --> J[Episodes API]
    
    K[SearchInput] --> C
    
    subgraph "Frontend Components"
        A
        C
        G
        H
        K
    end
    
    subgraph "API Routes"
        B[/api/tmdb/trending]
        D[/api/tmdb/search]
        E[/api/tmdb/discover]
        F[/api/tmdb/genres]
        I[/api/tmdb/details]
        J[/api/tmdb/episodes]
    end
    
    subgraph "External Services"
        L[TMDB API]
        M[User Status/Lists APIs]
    end
    
    B --> L
    D --> L
    E --> L
    F --> L
    I --> L
    J --> L
    
    H --> M
```

### Data Flow

The current implementation uses TMDB as the primary data source with minimal local caching. Content data is fetched on-demand and enriched with user-specific information (watch status, list membership) from the existing user data tables.

#### Content Enrichment
- TMDB content is enriched with user watch status from existing `user_watch_status` table
- List membership is determined from existing `list_items` and `lists` tables
- No local content indexing or search optimization is currently implemented

### API Endpoints (Current Implementation)

#### Search API
```typescript
// GET /api/tmdb/search
interface SearchRequest {
  q: string; // Search query (required)
  type?: 'movie' | 'tv' | 'all'; // Content type filter
  page?: number; // Pagination
  year?: number; // Year filter (only for specific types)
}

interface SearchResponse {
  results: TMDBMovie[] | TMDBTVShow[];
  total_results: number;
  total_pages: number;
  page: number;
}
```

#### Discovery API
```typescript
// GET /api/tmdb/discover
interface DiscoverRequest {
  type?: 'movie' | 'tv'; // Content type
  page?: number; // Pagination
  genre?: number; // Genre ID filter
  year?: number; // Year filter
  sort_by?: string; // Sort option
}

interface DiscoverResponse {
  results: TMDBMovie[] | TMDBTVShow[];
  total_results: number;
  total_pages: number;
  page: number;
}

// GET /api/tmdb/trending
interface TrendingRequest {
  media_type?: 'all' | 'movie' | 'tv'; // Media type
  time_window?: 'day' | 'week'; // Time window
}

interface TrendingResponse {
  results: TMDBSearchItem[];
  total_results: number;
  total_pages: number;
  page: number;
}

// GET /api/tmdb/genres
interface GenresRequest {
  type?: 'movie' | 'tv' | 'all'; // Genre type
}

interface GenresResponse {
  genres: TMDBGenre[];
}
```

#### Content Details API
```typescript
// GET /api/tmdb/details
interface DetailsRequest {
  id: string; // TMDB content ID
  type: 'movie' | 'tv'; // Content type
}

interface DetailsResponse {
  // Returns TMDBMovieDetails or TMDBTVShowDetails
  // Extended content information from TMDB
}

// GET /api/tmdb/episodes/[id]
interface EpisodesRequest {
  season: string; // Season number (required)
  episode?: string; // Episode number (optional)
}

interface EpisodesResponse {
  season?: TMDBSeason; // If no episode specified
  episode?: TMDBEpisode; // If episode specified
}
```

### Frontend Components (Current Implementation)

#### SearchClient Component
```typescript
// components/search/SearchClient.tsx
'use client';
export function SearchClient() {
  // Main search and discovery interface
  // Features:
  // - Debounced search input with SearchInput component
  // - Content type filtering (all, movie, tv)
  // - Genre and year filtering
  // - Sort options (popularity, rating, release date, title)
  // - Trending content display when no search query
  // - Load more functionality for discover content
  // - Filter toggle with collapsible filter panel
}
```

#### DashboardClient Component
```typescript
// components/dashboard/DashboardClient.tsx
'use client';
export function DashboardClient() {
  // Dashboard with trending content preview
  // Features:
  // - Display trending content (6 items)
  // - Navigation to search/discover page
  // - User profile integration
  // - Activity feed integration
}
```

#### SearchInput Component
```typescript
// components/ui/SearchInput.tsx
export function SearchInput() {
  // Reusable search input with debouncing
  // Features:
  // - Debounced search (500ms default)
  // - Loading states
  // - Clear functionality
  // - Search icon and clear button
}
```

#### ContentCard Component
```typescript
// components/ui/ContentCard.tsx
export function ContentCard() {
  // Content display card
  // Features:
  // - Poster image with fallback
  // - Rating badge with star icon
  // - Watch status badge
  // - Title, year, and type badges
  // - Vote count display
  // - Click to open ContentDetailsModal
}
```

#### ContentDetailsModal Component
```typescript
// components/ui/ContentDetailsModal.tsx
export function ContentDetailsModal() {
  // Detailed content view modal
  // Features:
  // - Backdrop and poster images
  // - Comprehensive content information
  // - Tabbed interface (Overview, Episodes for TV, Lists)
  // - Watch status management
  // - List management integration
  // - Episode tracking for TV shows
  // - Genre display with badges
}
```

### Implementation Notes

#### Current Architecture Characteristics
- **Direct TMDB Integration**: All content data is fetched directly from TMDB API
- **Minimal Caching**: Uses Next.js built-in caching (1 hour revalidation)
- **Client-Side State Management**: React state for UI interactions and filtering
- **Authentication Middleware**: All API routes use `withAuth` middleware
- **Content Enrichment**: TMDB data is enriched with user watch status and list membership

#### Key Implementation Details
1. **Search**: Direct TMDB search API calls with basic filtering
2. **Discovery**: TMDB discover and trending endpoints with client-side filtering
3. **Content Details**: On-demand fetching of detailed content information
4. **User Data**: Integration with existing user status and list management systems
5. **Performance**: Debounced search input and loading states for better UX

#### Current Limitations
- No local search indexing or optimization
- No autocomplete suggestions
- No advanced filtering beyond basic TMDB parameters
- No personalized recommendations
- No search history or analytics
- Limited offline functionality

#### Future Enhancement Opportunities
- Implement local content indexing for faster search
- Add autocomplete with suggestion caching
- Build recommendation engine based on user behavior
- Add search analytics and user behavior tracking
- Implement advanced filtering and sorting options
- Add social discovery features

---

*This feature document should be updated as search capabilities expand and new discovery methods are implemented.*