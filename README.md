# Esports Tracker

A self-hosted tournament standings and leaderboard app for local and regional esports communities. Operators import results from [start.gg](https://www.start.gg/) or manually, and players browse a branded public site showing season rankings, upcoming events, and tournament history.

---

## Features

### Public site
- **Season leaderboards** — per-game standings with a year selector; tied players share a rank and the next rank skips
- **Tournament history** — expandable result panels showing placements, points, and optional recording links
- **Upcoming events** — registration cards with deadlines; auto-filters events whose registration has closed
- **Live stream embed** — configurable Twitch, YouTube Live, or Facebook Live embed on the home page
- **Custom branding** — site name, tagline, primary/accent colors, logo, hero banner, announcement bar, footer links, and social icons

### Admin panel (`/admin`)
- **Import from start.gg** — paste a tournament URL; the app fetches the bracket and creates standings automatically
- **Manual CRUD** — create, edit, and delete games, tournaments, and standings without touching start.gg
- **Upcoming tournament management** — track pre-event registrations; force-import standings when start.gg state lags
- **Organizer sync** — configure a start.gg profile URL; the app pulls upcoming events on a schedule
- **Auto-completion checker** — background job (hourly) queries start.gg and auto-imports results for overdue events
- **Cloudinary integration** — manage image-hosting credentials in the UI; falls back to local disk storage when unconfigured
- **Admin accounts** — granular permissions: `manage_games`, `manage_tournaments`, `manage_upcoming`, `manage_branding`, `manage_integrations`, `manage_accounts`

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite 5, React Router 6 |
| Backend | Express 4, Node.js 18 |
| Database | SQLite via better-sqlite3 (WAL mode) |
| Auth | JWT (jsonwebtoken) + bcryptjs |
| Image hosting | Cloudinary (optional) or local disk |
| External API | start.gg GraphQL API |

---

## Project structure

```
esports-tracker/
├── client/                  React + Vite frontend
│   └── src/
│       ├── api/             Typed API client (publicApi, authApi, adminApi)
│       ├── components/      Shared UI components (Navbar, Footer, GameIcon, …)
│       ├── context/         AuthContext, BrandingContext
│       ├── pages/           Home, GameStandings, Login, Admin
│       └── utils/           dates, images, rankings, streams, colors
└── server/                  Express API
    ├── db/                  Schema, migrations, better-sqlite3 connection
    ├── middleware/           auth (JWT), errorHandler, rateLimit
    ├── routes/              Public and admin API routes
    │   └── admin/           games, tournaments, accounts, upcoming, startgg, branding, integrations
    ├── scripts/             createFirstAdmin.js, hashPassword.js
    ├── services/            startgg.js, completionChecker.js, cloudinary.js, points.js
    └── utils/               errors.js
```

---

## Setup

### Prerequisites

- **Node.js 18+**
- A [start.gg Personal Access Token](https://developer.start.gg/docs/authentication) (optional — needed for imports)
- A [Cloudinary account](https://cloudinary.com/) (optional — for cloud image hosting)

### 1. Install dependencies

```bash
cd server && npm install
cd ../client && npm install
```

### 2. Configure environment variables

```bash
cp server/.env.example server/.env
```

Edit `server/.env`. See the [Environment variables](#environment-variables) table below.

### 3. Create the first admin account

Either set `FIRST_ADMIN_USER` and `FIRST_ADMIN_PASS` in `.env` (the account is created automatically on first boot), or run:

```bash
cd server
node scripts/createFirstAdmin.js <username> <password>
```

This refuses to run if any admin account already exists.

### 4. Start development servers

```bash
# Terminal 1 — API (port 3001)
cd server && npm run dev

# Terminal 2 — Vite dev server (port 5173)
cd client && npm run dev
```

Open **http://localhost:5173**. The Vite dev server proxies `/api` and `/uploads` to port 3001 automatically.

---

## Environment variables

All variables are read by the server. Copy `.env.example` to `.env` and fill in the values.

| Variable | Required | Default | Description |
|---|---|---|---|
| `JWT_SECRET` | **Yes** | — | Secret used to sign and verify JWTs. Generate one with `openssl rand -hex 32`. The server exits on startup if this is unset. |
| `PORT` | No | `3001` | Port the Express server listens on. |
| `CLIENT_ORIGIN` | No | — | Production frontend URL added to the CORS allowlist. `http://localhost:5173` is always allowed. |
| `DB_PATH` | No | `./data/database.sqlite` | SQLite file location. Use an absolute path when deploying (e.g. `/app/data/database.sqlite`) and mount persistent storage at that directory. |
| `FIRST_ADMIN_USER` | No | — | Username for an auto-created superadmin on first boot. Ignored once any admin account exists. |
| `FIRST_ADMIN_PASS` | No | — | Password for the auto-created superadmin. Hashed with bcryptjs (12 rounds) before storage. |
| `CLOUDINARY_CLOUD_NAME` | No | — | Cloudinary cloud name. Credentials set in Admin → Integrations take precedence over this value. |
| `CLOUDINARY_API_KEY` | No | — | Cloudinary API key. DB value takes precedence. |
| `CLOUDINARY_API_SECRET` | No | — | Cloudinary API secret. DB value takes precedence. |

---

## Deployment

The client and server are deployed as two separate services.

### Railway (recommended)

The repo includes `railway.json` and `nixpacks.toml` for both services.

#### Server service

1. Create a Railway project and add a service pointing at the `server/` directory.
2. Add a **Volume** mounted at `/app/data` for persistent SQLite storage.
3. Set `DB_PATH=/app/data/database.sqlite`.
4. Set `JWT_SECRET`, `CLIENT_ORIGIN`, and (on first deploy) `FIRST_ADMIN_USER` + `FIRST_ADMIN_PASS`.
5. Deploy — Railway detects Node via nixpacks and runs `npm start`.

#### Client service

1. Add a second service pointing at the `client/` directory.
2. Set the API base URL in `client/src/api/index.js` to the server service's public domain, or expose it via a Vite env variable.
3. Deploy — Railway runs `npm run build` and serves the output.

### Self-hosted (nginx + PM2)

```bash
# Build the frontend
cd client && npm run build
# Copy client/dist/ to your nginx web root or serve with 'npm start' (uses 'serve')

# Start the API with PM2
cd server
JWT_SECRET=<secret> CLIENT_ORIGIN=https://your-domain.com pm2 start index.js --name esports-tracker
```

Minimal nginx block (single domain, API under `/api`):

```nginx
server {
    listen 80;
    server_name your-domain.com;

    root /var/www/esports-tracker;   # path to client/dist/
    index index.html;

    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Run `certbot --nginx -d your-domain.com` to add HTTPS.

### Docker

There is no Dockerfile included. The simplest approach is the Railway deployment above. For a custom Docker setup, use a multi-stage build: install and build the client in one stage, then copy the output alongside the server in the final image.

---

## Database

SQLite is used for simplicity and zero-dependency hosting. The database file is created automatically at `server/data/database.sqlite` (or `DB_PATH` if set). Schema and migrations run on every startup and are fully idempotent.

| Table | Purpose |
|---|---|
| `games` | Configured games (name, emoji icon, optional image) |
| `tournaments` | Tournament records linked to a game |
| `standings` | Per-player placements and season points |
| `upcoming_tournaments` | Future events shown on the public site |
| `admins` | Admin users with bcrypt-hashed passwords and permissions |
| `settings` | Key/value store for branding and integration config |
| `pending_games` | Games found during organizer sync awaiting admin review |

---

## Points schedule

Season standings are computed by summing points earned across all tournaments a player attended in a given year.

| Placement | Points |
|---|---|
| 1st | 100 |
| 2nd | 80 |
| 3rd | 65 |
| 4th | 50 |
| 5th–6th | 40 |
| 7th–8th | 32 |
| 9th–12th | 25 |
| 13th–16th | 18 |
| 17th–24th | 12 |
| 25th–32nd | 8 |
| 33rd+ | 5 |

Tied players (e.g. joint 5th–6th from the same bracket round) share the same placement number and earn identical points.

---

## start.gg integration

1. In the admin panel go to **Settings → Integrations** and paste your Personal Access Token (start.gg → top-right menu → Developer → Personal Access Tokens).
2. Optionally enter your organizer profile URL to enable auto-sync.

**Import flow:** Admin → Start.gg → paste tournament URL → pick event → confirm. The app fetches the top-64 standings and writes the tournament and standings records in one step.

**Organizer sync:** When an organizer URL is configured, the server queries it on the configured schedule (manual, daily, or weekly) and adds upcoming events. Events for unrecognised games go into a **Pending Games** queue for manual review.

**Auto-completion:** Every hour the server checks upcoming tournaments whose event date has passed. If start.gg reports the event as complete (or the bracket has resolved despite a stale `ACTIVE` state), standings are imported automatically and the upcoming entry is marked completed.

---

## Utility scripts

```bash
# Create the first superadmin (only works when no admins exist)
cd server && node scripts/createFirstAdmin.js <username> <password>

# Print the bcrypt hash of a password (useful for manual DB restoration)
cd server && node scripts/hashPassword.js <password>
```

---

## License

MIT
