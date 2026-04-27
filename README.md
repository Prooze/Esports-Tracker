# Esports Tracker

A self-hosted esports tournament standings tracker with start.gg integration. Operators run a single admin account (or team) to import tournament results; visitors see public leaderboards and upcoming events.

**Stack:** React + Vite · Node.js + Express · SQLite (better-sqlite3) · JWT auth · Cloudinary (optional)

---

## Features

**Public site**
- Per-game season leaderboards with year selector
- Expandable tournament result panels with placement + points
- Upcoming tournament cards with registration links
- Live stream embed (Twitch, YouTube Live, Facebook Live)
- Customisable branding — site name, colours, logo, hero banner, announcement bar, footer links, social icons

**Admin panel** (`/admin`)
- Import tournament results directly from a start.gg URL (auto-detects game, date, entrants)
- Manually add / edit / delete tournaments and standings
- Manage games (name, emoji, optional icon image)
- Upcoming tournament management with auto-completion detection
- Organizer sync — pull upcoming events from a start.gg profile on a schedule
- Cloudinary integration for image hosting (falls back to local disk)
- Multi-account support with per-permission access control

---

## Local Development

### 1. Install dependencies

```bash
cd server && npm install
cd ../client && npm install
```

### 2. Configure the server

```bash
cp server/.env.example server/.env
```

Edit `server/.env` and set at minimum:

```
JWT_SECRET=<long random string>
FIRST_ADMIN_USER=admin
FIRST_ADMIN_PASS=<your password>
```

Generate a JWT secret with: `openssl rand -hex 32`

The `FIRST_ADMIN_*` variables create a superadmin on first boot. They are ignored once any admin account exists.

### 3. Run both servers

**Terminal 1 — API server (port 3001)**
```bash
cd server && npm run dev
```

**Terminal 2 — Vite dev server (port 5173)**
```bash
cd client && npm run dev
```

Open **http://localhost:5173** — the Vite dev server proxies `/api` and `/uploads` to port 3001 automatically.

### 4. Add a start.gg API token

1. Log in at `/login`
2. Go to **Admin → Integrations**
3. Paste your start.gg Personal Access Token
   *(start.gg → top-right menu → Developer → Personal Access Tokens)*

---

## Environment Variables

All variables live in `server/.env`. Only `JWT_SECRET` is strictly required for production.

| Variable | Required | Default | Description |
|---|---|---|---|
| `JWT_SECRET` | Yes | — | Secret for signing admin JWTs. Use a long random string. |
| `PORT` | No | `3001` | HTTP port the server listens on. |
| `CLIENT_ORIGIN` | No | — | Production frontend URL added to CORS allowlist. |
| `DB_PATH` | No | `./data/database.sqlite` | Path to the SQLite database file. |
| `FIRST_ADMIN_USER` | No | — | Username for the auto-created superadmin on first boot. |
| `FIRST_ADMIN_PASS` | No | — | Password for the auto-created superadmin on first boot. |
| `CLOUDINARY_CLOUD_NAME` | No | — | Cloudinary cloud name for image hosting. |
| `CLOUDINARY_API_KEY` | No | — | Cloudinary API key. |
| `CLOUDINARY_API_SECRET` | No | — | Cloudinary API secret. |

Cloudinary credentials can also be set at runtime in **Admin → Integrations** — database values take precedence over env vars.

---

## Project Structure

```
esports-tracker/
├── client/                   React + Vite frontend
│   └── src/
│       ├── api/              Centralised fetch client (publicApi, authApi, adminApi)
│       ├── components/       GameIcon, Navbar, SiteFooter, SocialIcon
│       ├── context/          AuthContext, BrandingContext
│       ├── pages/            Home, GameStandings, Login, Admin
│       ├── utils/            dates, images, rankings, streams, colors
│       └── index.css         All styles (CSS variables, dark theme)
│
└── server/                   Express API
    ├── db/                   SQLite connection, schema, migrations
    ├── middleware/            auth (JWT), rateLimit, errorHandler
    ├── routes/
    │   ├── auth.js           POST /api/auth/login
    │   ├── games.js          GET  /api/games
    │   ├── tournaments.js    GET  /api/tournaments/:id/standings
    │   ├── public.js         GET  /api/settings/public, /api/upcoming
    │   └── admin/            Protected admin routes (games, tournaments,
    │                         upcoming, branding, integrations, startgg, accounts)
    ├── services/             startgg (GraphQL), cloudinary, completionChecker, points
    ├── utils/                errors (sendError helper)
    ├── scripts/              createFirstAdmin.js, hashPassword.js
    ├── app.js                Express app setup, route mounting
    └── index.js              Entry point (loads .env, starts server)
```

---

## Database

SQLite file at `server/data/database.sqlite` (created automatically). Schema and migrations run on every startup — safe to re-run.

| Table | Purpose |
|---|---|
| `games` | Configured games (name, emoji, optional icon) |
| `tournaments` | Tournament records linked to a game |
| `standings` | Per-player placements and season points |
| `upcoming_tournaments` | Future events shown on the public site |
| `admin_accounts` | Admin users with hashed passwords and permissions |
| `settings` | Key/value store for branding and integration config |
| `pending_games` | Games found during organizer sync awaiting admin review |

---

## Points System

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

---

## Deployment (Railway)

1. Create a Railway project with two services: **server** (Node) and **client** (static).
2. Attach a Volume to the server service and set `DB_PATH=/app/data/database.sqlite`.
3. Set `CLIENT_ORIGIN` to the client's public URL in the server's environment.
4. Set `VITE_API_URL` to the server's public URL in the client's environment.
5. Set `JWT_SECRET`, `FIRST_ADMIN_USER`, `FIRST_ADMIN_PASS` in the server environment.
6. The server's `railway.json` and `nixpacks.toml` are already configured for this layout.

---

## Creating an Admin Account Manually

If you skipped `FIRST_ADMIN_*` or need to create additional accounts outside the UI:

```bash
cd server
node scripts/createFirstAdmin.js <username> <password>
```

This creates a **superadmin** with all permissions. Additional limited accounts can be created inside the admin panel under the **Accounts** tab.

---

## Contributing

1. Fork the repo and create a feature branch.
2. Run `npm run dev` in both `server/` and `client/`.
3. Keep the server flat (`routes/`, `services/`, `middleware/`, `db/`) — no nested `src/`.
4. All API errors must use `sendError(res, status, message)` → `{ error: true, message }`.
5. Open a pull request with a clear description of what changed and why.
