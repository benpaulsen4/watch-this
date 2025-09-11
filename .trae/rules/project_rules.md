# WatchThis Project Coding Standards

## Core Architecture Rules

### 1. Server Components First
- **MUST**: All pages are server components by default
- **Pattern**: Use "islands of reactivity" - wrap client components in Suspense
- **Structure**: `page.tsx` (server) → `<Suspense>` → `ClientComponent.tsx`

```typescript
// ✅ Server component page
export default function Page() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <ClientComponent />
    </Suspense>
  );
}

// ✅ Client component for interactivity
'use client';
export function ClientComponent() { /* interactive logic */ }
```

### 2. Shared Layouts
- **MUST**: Use Next.js layout system for common UI elements
- **Structure**: `(authenticated)/layout.tsx` for auth wrapper, extract reusable headers/nav
- **Pattern**: Route groups for different auth states

### 3. Middleware Authentication
- **MUST**: ALL authenticated API routes use `withAuth` from `/src/lib/auth/api-middleware.ts`

```typescript
import { withAuth, AuthenticatedRequest } from '@/lib/auth/api-middleware';

async function handler(request: AuthenticatedRequest) {
  const userId = request.user.id; // User guaranteed to exist
  // API logic
}

export const GET = withAuth(handler);
```

## File Organization

```
src/
├── app/
│   ├── (authenticated)/     # Protected routes
│   ├── (public)/           # Public routes  
│   └── api/                # API routes (use withAuth)
├── components/
│   ├── ui/                 # Base components
│   └── [feature]/          # Feature-specific
└── lib/
    ├── auth/               # Authentication
    ├── db/                 # Database
    └── utils.ts            # Utilities
```

## Naming Conventions
- **Pages**: `page.tsx`, `layout.tsx`
- **Client Components**: Suffix with "Client" (e.g., `DashboardClient.tsx`)
- **API Routes**: `route.ts`
- **Files**: PascalCase for components, camelCase for utilities

## Code Standards

### TypeScript
- Strict configuration required
- Define interfaces for all data structures
- Proper typing for API responses

### Imports Order
1. React/Next.js
2. Third-party libraries
3. Internal components/utilities
4. Type imports (with `type` keyword)

### Styling
- **MUST**: Use Tailwind CSS exclusively
- **Colors**: `bg-gray-950` (background), `text-red-500` (accent), `border-gray-800`
- **Pattern**: Mobile-first responsive design

### Page Structure Template
```typescript
<div className="min-h-screen bg-gray-950">
  <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-50">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between h-16">
        {/* Header content */}
      </div>
    </div>
  </header>
  <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    {/* Page content */}
  </main>
</div>
```

## Performance Requirements
- Server components for initial data fetching
- Minimal client components
- Consistent loading states with Suspense
- Drizzle ORM for type-safe database operations
- Proper error handling with `handleApiError`

## Enforcement Checklist
- [ ] Server components with Suspense boundaries
- [ ] Client components marked with `'use client'`
- [ ] API routes use `withAuth` middleware
- [ ] Consistent error/loading states
- [ ] Proper TypeScript typing
- [ ] Shared layout components
- [ ] Tailwind CSS styling