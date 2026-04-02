# Attendix Cloud

Full-stack biometric attendance SaaS. Single project, one `npm install`, runs everywhere.

```
attendance-gateway/
├── client/                # React + Vite frontend
│   ├── src/
│   │   ├── pages/         # All page components
│   │   ├── components/    # Shared UI components
│   │   ├── store/         # Zustand state (auth, theme, context)
│   │   └── lib/           # api.js, utils.js
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── postcss.config.js
├── server/                # Node.js + Express backend
│   ├── app.js             # Main server (WebSocket, REST API, serves dist/)
│   ├── auth/              # JWT middleware + rate limits
│   ├── models/            # Mongoose schemas
│   ├── routes/            # All API route files
│   ├── services/          # Subscription, upload services
│   ├── notify/            # Notification engine
│   └── scripts/           # Seed admin, seed plans
├── dist/                  # Built frontend (after npm run build)
├── package.json           # Unified deps + scripts
├── .env                   # Environment variables (copy from .env.example)
└── .env.example
```

## Quick start

```bash
# 1. Install everything
npm install

# 2. Copy and configure env
cp .env.example .env
# Edit .env — set MONGO_URI, JWT secrets, WS_SECRET

# 3. Seed database
npm run seed

# 4a. Development (API on :8000, UI on :5173 with hot reload)
npm run dev

# 4b. Production (build frontend, serve everything from :8000)
npm run build
npm start
```

## Development

`npm run dev` starts two processes concurrently:
- **API** (`npm run server:dev`) — Express on port 8000, auto-restarts on changes
- **UI** (`npm run client:dev`) — Vite dev server on port 5173, proxies API calls to 8000

Open **http://localhost:5173** during development.

## Production

```bash
npm run build    # Vite builds client/ → dist/
npm start        # Express serves dist/ as static + all API routes on :8000
```

Open **http://localhost:8000** in production. Single port, single process.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | Server port (default 8000) |
| `MONGO_URI` | **Yes** | MongoDB connection string |
| `JWT_ACCESS_SECRET` | **Yes** | JWT signing secret (access tokens) |
| `JWT_REFRESH_SECRET` | **Yes** | JWT signing secret (refresh tokens) |
| `WS_SECRET` | **Yes** | Bridge WebSocket auth secret |
| `BCRYPT_ROUNDS` | No | Password hashing rounds (default 12) |

All other configuration (SMTP, SMS, Cloudinary, Google Calendar, etc.) is managed through **Admin → Plugins** in the UI — stored in MongoDB.

## Bridge WebSocket

Biometric device bridges connect via WebSocket:
```
ws://your-server:8000/bridge?secret=<WS_SECRET>
```

## Claude Code usage

With the monorepo structure, Claude Code can see both `server/` and `client/` in one project. Reference files directly:
- `server/routes/attendance.js` — attendance API
- `client/src/pages/Attendance.jsx` — attendance UI
- `server/app.js` — main server config