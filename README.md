# Velozity Global Solutions — Real-Time Client Project Dashboard

A TypeScript full-stack assessment implementation using React, Express, PostgreSQL, Prisma, Socket.IO and node-cron. The assignment explicitly requires API-level role enforcement, JWT access + refresh tokens, a database-backed activity log, WebSocket updates, missed-event catch-up, notifications, filters and seeded data. This implementation covers those requirements. fileciteturn1file0L13-L31

## Architecture

```text
React + TypeScript (Vercel)
        │ HTTPS / WebSocket
        ▼
Express + Socket.IO API (container)
        │ Prisma
        ▼
PostgreSQL
        ▲
 node-cron overdue scheduler
```

### Roles and authorization
- **ADMIN:** all clients/projects/users and global activity.
- **PM:** only projects where `creatorId = req.user.id`; their project/team activity.
- **DEVELOPER:** only tasks where `developerId = req.user.id`.
- Authorization is checked at the API/database query boundary, so changing a client-side role or URL cannot reveal another user's records.

## Authentication
Access tokens are short-lived JWTs and held by the frontend runtime only. Refresh tokens are rotated, hashed in the database, and stored in an **HttpOnly cookie**. The refresh token is never placed in localStorage.

## Real-time design
Socket.IO was chosen over native WebSocket because it provides reliable reconnection, rooms, event acknowledgements and a small ergonomic API while remaining a true WebSocket transport for this application. Every connection is authenticated using the access token. Project rooms are joined only after `canViewProject()` succeeds. Admins can additionally join a global activity room. Activity events are persisted first and then emitted to authorized rooms. Notification badges use user-specific rooms, so there is no polling.

When a client reconnects, it asks `/api/activities/missed?since=...`; the server queries PostgreSQL for up to 20 events after the client's last activity timestamp. This satisfies database-backed catch-up instead of relying on in-memory cache.

## Background job
`node-cron` runs every five minutes and marks past-due TODO / IN_PROGRESS / IN_REVIEW tasks as `OVERDUE`. It is appropriate for this small single-service assessment because no Redis infrastructure is required. A BullMQ worker would be preferable for horizontally scaled production deployments.

## Database / indexing
Core relations are `User → Project`, `Client → Project`, `Project → Task`, `User → Task`, `Task/Project/User → Activity`, and `User → Notification/RefreshToken`. Foreign keys use restrictive deletes for users/projects where historical data should remain valid and cascades where dependent records should disappear.

Indexes target the access and dashboard queries: project creator/client, task project+status, developer+status, priority+dueDate, dueDate+status, activity project+createdAt, activity user+createdAt, notification user+read+createdAt and refresh token user+expiry.

## Local setup

### Option A — Docker
```bash
docker compose up --build
```
Then in another terminal, install frontend dependencies and run Vite:
```bash
npm install
cp apps/web/.env.example apps/web/.env
npm run dev -w apps/web
```
Open `http://localhost:5173`.

### Option B — local Node + PostgreSQL
1. Create PostgreSQL database `velozity`.
2. Copy `apps/api/.env.example` to `apps/api/.env` and set secrets.
3. Run:
```bash
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
npm run dev -w apps/web
```

### Seed credentials
All seeded users use password `Password123!`.

- Admin: `admin@velozity.local`
- PM 1: `pm1@velozity.local`
- PM 2: `pm2@velozity.local`
- Developers: `dev1@velozity.local` through `dev4@velozity.local`

The seed creates 3 projects, 18 tasks, overdue tasks, notifications and historical activity entries, as required by the assessment. fileciteturn1file0L83-L87

## Filters
Task filters are URL-query based, e.g.:
`/api/tasks?status=IN_PROGRESS&priority=HIGH&from=2026-09-01&to=2026-09-30`

## Deployment

### API
Deploy `apps/api` as a Node container on a WebSocket-capable host such as Railway, Render, Fly.io or a VPS. Configure:
- `DATABASE_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `FRONTEND_URL`
- `API_PORT`

Run Prisma migration/seed during deployment as appropriate.

### Web
Create a Vercel project with this repository and set the project root to `apps/web` (or use the root `vercel.json`). Set:
- `VITE_API_URL=https://YOUR-API-HOST`
- `VITE_SOCKET_URL=https://YOUR-API-HOST`

The frontend is hosted on Vercel as requested. The API is intentionally deployed to a WebSocket-capable runtime because Vercel's serverless functions are not a suitable Socket.IO server runtime; moving the WebSocket server into a serverless function would violate the assessment's real-time requirement. The browser application remains the Vercel-hosted application.

## Known limitations
- Presence is maintained in process memory; for multiple API instances it should be moved to Redis with Socket.IO's Redis adapter.
- Access tokens are intentionally kept in runtime memory; a full browser reload relies on the HttpOnly refresh cookie to obtain a new access token.
- The scheduler is designed for one worker. A distributed deployment should use a dedicated job queue.
- The supplied UI focuses on demonstrating the assessment's core flows; production polish would add richer forms, pagination and audit administration.

## Explanation (150–250 words)
The hardest part was enforcing a real-time activity feed without turning authorization into a frontend concern. I treated authorization as a data-access rule: every protected API handler receives the authenticated user from JWT middleware, and project/task queries are constrained by the user's role and ownership. The same rule is applied when a Socket.IO client attempts to join a project room, preventing a developer from subscribing to another team's events simply by changing a project ID. Status changes are written to PostgreSQL as activity records before being emitted to authorized rooms. Admins receive a global stream, project managers receive activity from projects they own, and developers receive activity only for tasks assigned to them. To handle offline users, the client stores only the timestamp of its latest activity event and requests the next 20 events from PostgreSQL after reconnecting; the server never depends on an in-memory event cache. Notifications use user-specific WebSocket rooms, so unread counts update immediately rather than through polling. If I did this again, I would introduce Redis for shared presence and Socket.IO scaling, and BullMQ for distributed background jobs, while keeping the same API authorization boundaries.

## Requirement coverage
The assessment specifies React + TypeScript, Node + Express/Fastify, PostgreSQL, Prisma/raw SQL, WebSockets, node-cron/Bull, server-side validation, structured errors and environment-based secrets. fileciteturn1file0L71-L82 This repository uses React/TypeScript, Express, PostgreSQL, Prisma, Socket.IO, node-cron, Zod, structured error middleware and `.env` configuration.
