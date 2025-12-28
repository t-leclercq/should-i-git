# Backend API Server

Express server that exposes Git operations through REST API endpoints.

## Endpoints

- `GET /api/health` - Health check endpoint
- `GET /api/commits` - Get commits (supports query params: `maxCount`, `since`, `until`, `author`, `path`, `all`)
- `GET /api/commits/branch/:branchName` - Get commits from a specific branch
- `GET /api/branches` - Get branches (supports query params: `remote`, `all`)
- `GET /api/tags` - Get tags (supports query params: `sort`)

## Running the Server

```bash
# Development mode with auto-reload
npm run dev:backend

# Or run both frontend and backend together
npm run dev:all
```

The server runs on `http://localhost:3001` by default.

## Environment Variables

- `PORT` - Server port (default: 3001)

