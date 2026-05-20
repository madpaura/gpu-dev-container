# GPU Dashboard - Frontend

React + TypeScript frontend for the GPU Dashboard Command Center.

## Technology Stack

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Styling
- **shadcn/ui** - UI component library
- **Lucide React** - Icons
- **React Router** - Client-side routing
- **Recharts** - Charts and graphs

## Development

### Prerequisites
- Node.js 18+
- npm or yarn

### Setup
```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

### Available Scripts
```bash
npm run dev       # Start dev server with hot reload (port 5173)
npm run build     # Build for production
npm run build:dev # Build for development
npm run lint      # Run ESLint
npm run preview   # Preview production build
```

## Project Structure

```
src/
├── components/           # Reusable UI components
│   ├── ui/              # shadcn/ui base components
│   ├── icons/           # Custom icon components
│   ├── AdminSidebar.tsx # Admin navigation
│   ├── UserSidebar.tsx  # User navigation
│   ├── Header.tsx       # App header
│   └── ...
├── pages/               # Route page components
│   ├── AdminDashboard.tsx
│   ├── AdminUsers.tsx
│   ├── AdminServers.tsx
│   ├── AdminImages.tsx
│   ├── AdminLogs.tsx
│   ├── UserDashboard.tsx
│   ├── UserContainers.tsx
│   └── ...
├── hooks/               # Custom React hooks
│   ├── useAuth.tsx      # Authentication context
│   ├── usePermissions.tsx # Permission checks
│   ├── useToast.ts      # Toast notifications
│   └── ...
├── lib/                 # Utilities and API clients
│   ├── api.ts           # Main API client
│   ├── docker-api.ts    # Docker operations
│   ├── container-api.ts # Container operations
│   └── utils.ts         # Helper functions
├── config/              # Configuration files
│   └── endpoints.ts     # API endpoint definitions
├── App.tsx              # Main app with routing
├── main.tsx             # Entry point
└── index.css            # Global styles
```

## Key Features

### Authentication
- Login/Register with email validation
- Session-based authentication
- Role-based access (Admin, QVP, Regular)
- Protected routes

### Admin Panel
- **Dashboard**: System overview and statistics
- **Users**: User management, approval, password reset
- **Servers**: Server monitoring and management
- **Images**: Docker image management
- **Logs**: Audit log viewer
- **Traffic**: Network traffic monitoring

### User Panel
- **Dashboard**: Personal container status
- **Containers**: Container management (start/stop)
- **Services**: Access to VSCode, Jupyter, Terminal

## API Integration

API clients are located in `src/lib/`:

```typescript
// Example API usage
import { adminApi } from '../lib/api';

// Fetch users
const users = await adminApi.getUsers(token);

// Create container
const result = await adminApi.approveUser(userId, server, resources, token);
```

## Styling

Uses Tailwind CSS with custom theme configuration:

```typescript
// tailwind.config.ts
// Custom colors, spacing, and component styles
```

### Theme Support
- Light/Dark mode toggle
- System preference detection
- Persistent theme selection

## Environment Variables

Create `.env` for environment-specific settings:

```bash
VITE_API_BASE_URL=http://localhost:8500
```

## Adding New Features

### New Page
1. Create component in `src/pages/`
2. Add route in `src/App.tsx`
3. Add navigation link in sidebar

### New API Endpoint
1. Add method in `src/lib/api.ts`
2. Define types/interfaces
3. Use in components with proper error handling

### New Component
1. Create in `src/components/`
2. Use TypeScript interfaces for props
3. Follow existing patterns for consistency

## Code Style

- Use TypeScript strict mode
- Follow ESLint rules
- Use functional components with hooks
- Proper error handling with try/catch
- Loading states for async operations
