# WatchThis - Movie & TV show watchlist app for you and your friends

## 🛠️ Tech Stack

- **Frontend**: Next.js 15 with App Router, React 19, TypeScript
- **Styling**: Tailwind CSS 4
- **UI Components**: React ARIA Components for accessibility
- **Database**: PostgreSQL with Drizzle ORM
- **Testing**: Vitest with React Testing Library

## 📋 Prerequisites

- Node.js 18+
- PostgreSQL database

## 🚀 Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Setup

Copy the example environment file and configure your variables:

```bash
cp .env.example .env.local
```

Update `.env.local` with your configuration:

```env
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/watchthis"
```

### 3. Database Setup

Generate and run database migrations:

```bash
# Generate migration files
npm run db:generate

# Apply migrations to your database
npm run db:migrate

# Or push schema directly (for development)
npm run db:push
```

### 4. Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📝 Available Scripts

- `npm run dev` - Start development server with Turbopack
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run test` - Run tests with Vitest
- `npm run test:ui` - Run tests with Vitest UI
- `npm run test:run` - Run tests once
- `npm run db:generate` - Generate Drizzle migrations
- `npm run db:migrate` - Run database migrations
- `npm run db:push` - Push schema to database
- `npm run db:studio` - Open Drizzle Studio

## 🧪 Testing

The project uses Vitest for testing with React Testing Library:

```bash
# Run tests
npm run test

# Run tests with UI
npm run test:ui

# Run tests once (CI mode)
npm run test:run
```

## 🛣️ Roadmap

- [ ] TV show scheduling
- [x] Watch status sync option for shared lists
- [x] Activity feed to see you and your friends recent activity on lists and watch status
- [x] Quick complete action from content card
- [x] Improved import and export for watch status
- [ ] Multi-device passkey management
- [ ] JustWatch integration with per-user streaming service configuration
- [ ] \*arr stack integration for when content is not on any configured streaming services
- [ ] Component refactoring and tech debt squashing
- [ ] Recommendations of some kind
- [ ] Sorting and filtering inside lists
- [ ] Cast tab for content details
- [ ] Statistics page in user profile
- [ ] List quick access and refreshed list cards
- [ ] Splash page
