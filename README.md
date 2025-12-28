# Should i Git ?

Yes, definitely !
But let's verify that, first, you're 100% sure of what's happening.

This repo will help you:

- visualize Git commands effects,
- understand what to use according to your use case,
- reverting any mistakes manually, to avoid creating unnecessary noise on your Git tree

## What's inside

### Template used

Vite project with React, TypeScript, and shadcn/ui.

### Additional packages

- `tsx` - For running TypeScript scripts directly
- `express` - Backend API server
- `cors` - CORS middleware for Express
- `concurrently` - Run frontend and backend together

## Git Log to JSON

### Problem

The standard git log command with JSON formatting breaks when commit messages contain special characters like backslashes (`\`), quotes (`"`), or newlines. For example:

```bash
git log --pretty=format:'{"subject": "%s"}'
```

This will produce invalid JSON if a commit message contains `\_o_/` or other special characters.

### Solution

This project includes a utility that properly escapes all special characters to produce valid JSON:

**Using the CLI script:**
```bash
npm run git-log-json -- --max-count 10 --pretty
```

**Using the TypeScript API:**
```typescript
import { getGitLogAsJson, getGitLogAsJsonString } from './lib/git-log';

// Get as array of objects
const commits = getGitLogAsJson({ maxCount: 10 });

// Get as JSON string
const json = getGitLogAsJsonString({ maxCount: 10 }, true);
```

The utility uses a delimiter-separated format internally and properly escapes all JSON special characters, ensuring valid JSON output even with commit messages containing backslashes, quotes, newlines, or other special characters.

## Running the Application

### Development Mode

The application consists of a frontend (React/Vite) and a backend (Express) server.

**Run both frontend and backend together:**
```bash
npm run dev:all
```

**Or run them separately:**
```bash
# Terminal 1: Frontend (runs on http://localhost:5173)
npm run dev

# Terminal 2: Backend (runs on http://localhost:3001)
npm run dev:backend
```

The frontend will automatically proxy API requests to the backend server.

### Backend API

The backend exposes the following endpoints:

- `GET /api/health` - Health check
- `GET /api/commits` - Get commits (query params: `maxCount`, `since`, `until`, `author`, `path`, `all`)
- `GET /api/commits/branch/:branchName` - Get commits from a specific branch
- `GET /api/branches` - Get branches (query params: `remote`, `all`)
- `GET /api/tags` - Get tags (query params: `sort`)

See `backend/README.md` for more details.