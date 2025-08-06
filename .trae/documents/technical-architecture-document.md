# WatchThis - Technical Architecture Document

## 1. Architecture Design

```mermaid
graph TD
    A[User Browser] --> B[Next.js 15 Frontend]
    B --> C[Passkey Authentication]
    B --> D[TMDB API Client]
    B --> E[Drizzle ORM Client]
    E --> F[PostgreSQL Database]
    D --> G[TMDB External API]
    
    subgraph "Frontend Layer"
        B
        C
    end
    
    subgraph "Data Layer"
        F
    end
    
    subgraph "External Services"
        G
    end
```

## 2. Technology Description

* Frontend: Next.js\@15 + React\@19 + TypeScript + Tailwind CSS\@4 + React ARIA Components

* Database: PostgreSQL with Drizzle ORM

* Authentication: WebAuthn/Passkeys (no backend auth service)

* External APIs: TMDB API v3

* Testing: Vitest + React Testing Library

* Deployment: Vercel OR Docker

## 3. Route Definitions

| Route                   | Purpose                                                           |
| ----------------------- | ----------------------------------------------------------------- |
| /                       | Home dashboard with lists overview and activity feed              |
| /auth                   | Authentication page for passkey registration and sign-in          |
| /lists                  | My Lists page showing all personal and shared lists               |
| /lists/\[id]            | Individual list details with content management and collaboration |
| /search                 | Content discovery page with TMDB search and filtering             |
| /profile                | User profile with settings and data export/import                 |
| /api/tmdb/search        | Server-side TMDB API proxy for content search                     |
| /api/tmdb/details/\[id] | Server-side TMDB API proxy for content details                    |

## 4. API Definitions

### 4.1 Core API

**TMDB Content Search**

```
GET /api/tmdb/search
```

Request:

| Param Name | Param Type | isRequired | Description                              |
| ---------- | ---------- | ---------- | ---------------------------------------- |
| query      | string     | true       | Search term for movies/TV shows          |
| type       | string     | false      | Content type filter (movie, tv, or both) |
| page       | number     | false      | Page number for pagination               |

Response:

| Param Name     | Param Type | Description                     |
| -------------- | ---------- | ------------------------------- |
| results        | array      | Array of movie/TV show objects  |
| total\_pages   | number     | Total number of pages available |
| total\_results | number     | Total number of results         |

**Content Details**

```
GET /api/tmdb/details/[id]
```

Request:

| Param Name | Param Type | isRequired | Description     |
| ---------- | ---------- | ---------- | --------------- |
| id         | string     | true       | TMDB content ID |

Response:

| Param Name    | Param Type | Description                 |
| ------------- | ---------- | --------------------------- |
| id            | number     | TMDB content ID             |
| title         | string     | Movie title or TV show name |
| overview      | string     | Content description         |
| poster\_path  | string     | Poster image path           |
| release\_date | string     | Release date                |
| genres        | array      | Array of genre objects      |

## 5. Server Architecture Diagram

```mermaid
graph TD
    A[Next.js App Router] --> B[Page Components]
    A --> C[API Routes]
    B --> D[Client Components]
    B --> E[Server Components]
    C --> F[TMDB API Service]
    D --> G[Drizzle Client]
    E --> G
    G --> H[(PostgreSQL)]
    
    subgraph "Frontend Layer"
        B
        D
        E
    end
    
    subgraph "API Layer"
        C
        F
    end
    
    subgraph "Data Layer"
        G
        H
    end
```

## 6. Data Model

### 6.1 Data Model Definition

```mermaid
erDiagram
    USERS ||--o{ LISTS : owns
    USERS ||--o{ LIST_COLLABORATORS : collaborates
    LISTS ||--o{ LIST_COLLABORATORS : has
    LISTS ||--o{ LIST_ITEMS : contains
    USERS ||--o{ PASSKEY_CREDENTIALS : has
    USERS ||--o{ USER_CONTENT_STATUS : tracks
    LIST_ITEMS ||--o{ USER_CONTENT_STATUS : references
    
    USERS {
        uuid id PK
        string username UK
        timestamp created_at
        timestamp updated_at
    }
    
    PASSKEY_CREDENTIALS {
        uuid id PK
        uuid user_id FK
        string credential_id UK
        text public_key
        bigint counter
        string device_name
        timestamp created_at
        timestamp last_used
    }
    
    LISTS {
        uuid id PK
        uuid owner_id FK
        string name
        string description
        string list_type
        boolean is_public
        timestamp created_at
        timestamp updated_at
    }
    
    LIST_COLLABORATORS {
        uuid id PK
        uuid list_id FK
        uuid user_id FK
        string permission_level
        timestamp invited_at
        timestamp joined_at
    }
    
    LIST_ITEMS {
        uuid id PK
        uuid list_id FK
        integer tmdb_id
        string content_type
        string title
        string poster_path
        text notes
        timestamp added_at
        integer sort_order
    }
    
    USER_CONTENT_STATUS {
        uuid id PK
        uuid user_id FK
        integer tmdb_id
        string content_type
        string status
        boolean share_status_updates
        timestamp updated_at
        timestamp created_at
    }
```

### 6.2 Data Definition Language

**Users Table**

```sql
-- Create users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index
CREATE INDEX idx_users_username ON users(username);
```

**Passkey Credentials Table**

```sql
-- Create passkey_credentials table
CREATE TABLE passkey_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    credential_id VARCHAR(255) UNIQUE NOT NULL,
    public_key TEXT NOT NULL,
    counter BIGINT DEFAULT 0,
    device_name VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_passkey_credentials_user_id ON passkey_credentials(user_id);
CREATE INDEX idx_passkey_credentials_credential_id ON passkey_credentials(credential_id);
```

**Lists Table**

```sql
-- Create lists table
CREATE TABLE lists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    list_type VARCHAR(20) DEFAULT 'mixed' CHECK (list_type IN ('movie', 'tv', 'mixed')),
    is_public BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_lists_owner_id ON lists(owner_id);
CREATE INDEX idx_lists_created_at ON lists(created_at DESC);
```

**List Collaborators Table**

```sql
-- Create list_collaborators table
CREATE TABLE list_collaborators (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    list_id UUID NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission_level VARCHAR(20) DEFAULT 'collaborator' CHECK (permission_level IN ('collaborator', 'viewer')),
    invited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    joined_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(list_id, user_id)
);

-- Create indexes
CREATE INDEX idx_list_collaborators_list_id ON list_collaborators(list_id);
CREATE INDEX idx_list_collaborators_user_id ON list_collaborators(user_id);
```

**List Items Table**

```sql
-- Create list_items table
CREATE TABLE list_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    list_id UUID NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    tmdb_id INTEGER NOT NULL,
    content_type VARCHAR(10) NOT NULL CHECK (content_type IN ('movie', 'tv')),
    title VARCHAR(255) NOT NULL,
    poster_path VARCHAR(255),
    notes TEXT,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    sort_order INTEGER DEFAULT 0,
    UNIQUE(list_id, tmdb_id, content_type)
);

-- Create indexes
CREATE INDEX idx_list_items_list_id ON list_items(list_id);
CREATE INDEX idx_list_items_tmdb_id ON list_items(tmdb_id);
CREATE INDEX idx_list_items_sort_order ON list_items(list_id, sort_order);
```

**User Content Status Table**

```sql
-- Create user_content_status table
CREATE TABLE user_content_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tmdb_id INTEGER NOT NULL,
    content_type VARCHAR(10) NOT NULL CHECK (content_type IN ('movie', 'tv')),
    status VARCHAR(20) DEFAULT 'to_watch' CHECK (status IN ('to_watch', 'watching', 'watched')),
    share_status_updates BOOLEAN DEFAULT true,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, tmdb_id, content_type)
);

-- Create indexes
CREATE INDEX idx_user_content_status_user_id ON user_content_status(user_id);
CREATE INDEX idx_user_content_status_tmdb_id ON user_content_status(tmdb_id);
CREATE INDEX idx_user_content_status_updated_at ON user_content_status(updated_at DESC);
```

**Status Management Architecture**

The `user_content_status` table enables sophisticated status tracking that addresses cross-list synchronization and collaborative sharing:

1. **Cross-List Status Sync**: When content appears in multiple lists, its status is maintained globally per user through the `user_content_status` table, ensuring consistency across all lists.

2. **Collaborative Status Sharing**: The `share_status_updates` boolean flag allows users to control whether their status changes propagate to collaborators on shared lists. When enabled (default), status updates are visible to all list collaborators.

3. **Status Resolution**: The application joins `list_items` with `user_content_status` to display the current status for each user-content combination, falling back to 'to_watch' if no status record exists.

**Initial Data**

```sql
-- Create default "For Me" list for each user (handled in application logic)
-- This will be created automatically when a user registers
-- Initial user_content_status records are created when users first interact with content
```

## 7. Coding Standards

### 7.1 Component Architecture

**Server Components First**
- Use Server Components by default for all pages and components
- Only use Client Components when interactivity is required (forms, event handlers, state management)
- Create "islands of reactivity" using Client Components within Server Component trees
- Wrap Client Components with Suspense boundaries for better loading states

```tsx
// ✅ Good: Server Component with Client Component island
export default async function ListPage({ params }: { params: { id: string } }) {
  const list = await getList(params.id); // Server-side data fetching
  
  return (
    <div>
      <h1>{list.name}</h1>
      <Suspense fallback={<LoadingSpinner />}>
        <AddContentForm listId={list.id} /> {/* Client Component */}
      </Suspense>
    </div>
  );
}
```

### 7.2 Testing Requirements

**Comprehensive Test Coverage**
- Write unit tests for every utility function and library
- Write component tests for all UI components using React Testing Library
- Write integration tests for API routes and database operations
- Maintain minimum 80% code coverage

```tsx
// Example component test structure
describe('ListCard', () => {
  it('renders list information correctly', () => {
    render(<ListCard list={mockList} />);
    expect(screen.getByText(mockList.name)).toBeInTheDocument();
  });
  
  it('handles collaboration status display', () => {
    // Test collaborative features
  });
});
```

### 7.3 Layout and Authentication Patterns

**Shared Layouts**
- Extract common UI elements (headers, navigation, footers) into shared layout components
- Implement authentication checks at the layout level to avoid repetition
- Use layout.tsx files for route-level shared layouts

```tsx
// app/(authenticated)/layout.tsx
export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser(); // Single auth check for all child routes
  
  if (!user) {
    redirect('/auth');
  }
  
  return (
    <div className="min-h-screen bg-gray-900">
      <Header user={user} />
      <main className="container mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  );
}
```

### 7.4 API Route Authentication

**Middleware-First Authentication**
- Handle authentication in middleware whenever possible
- Pass user information from middleware to API routes via headers or request context
- Avoid re-checking authentication in API routes if middleware has already validated

```tsx
// middleware.ts
export async function middleware(request: NextRequest) {
  const user = await validateAuth(request);
  
  if (user) {
    // Add user info to request headers
    request.headers.set('x-user-id', user.id);
    request.headers.set('x-username', user.username);
  }
  
  return NextResponse.next({
    request: {
      headers: request.headers,
    },
  });
}

// API route using middleware auth
export async function GET(request: Request) {
  const userId = request.headers.get('x-user-id');
  
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  // No need to re-validate auth, middleware already did it
  const lists = await getUserLists(userId);
  return NextResponse.json(lists);
}
```

### 7.5 File Organization

**Consistent Structure**
- Group related components in feature-based directories
- Keep test files adjacent to source files with `.test.tsx` or `.spec.tsx` extensions
- Use barrel exports (index.ts) for clean imports
- Separate client and server utilities into appropriate directories

```
src/
├── app/
│   ├── (authenticated)/
│   │   ├── layout.tsx          # Auth layout
│   │   ├── dashboard/
│   │   └── lists/
│   └── (public)/
│       ├── layout.tsx          # Public layout
│       └── auth/
├── components/
│   ├── ui/                     # Reusable UI components
│   ├── forms/                  # Form components
│   └── layouts/                # Layout components
├── lib/
│   ├── auth/                   # Authentication utilities
│   ├── db/                     # Database utilities
│   └── utils.ts                # General utilities
└── __tests__/                  # Global test utilities
```

### 7.6 Performance Guidelines

**Optimization Best Practices**
- Use dynamic imports for heavy Client Components
- Implement proper caching strategies for database queries
- Optimize images with Next.js Image component
- Use React.memo() for expensive Client Components that don't need frequent re-renders

```tsx
// Dynamic import for heavy components
const VideoPlayer = dynamic(() => import('./VideoPlayer'), {
  loading: () => <VideoPlayerSkeleton />,
  ssr: false,
});

// Cached database query
const getListsWithCache = cache(async (userId: string) => {
  return await db.select().from(lists).where(eq(lists.ownerId, userId));
});
```

