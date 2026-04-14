# Esports Tracker

A full-stack esports tournament standings tracker with start.gg integration.

**Stack:** React + Vite · Node.js + Express · SQLite (better-sqlite3) · JWT auth

---

## Quick Start

### 1. Install dependencies

```bash
cd server && npm install
cd ../client && npm install
```

### 2. Generate your admin password hash

```bash
cd server
node scripts/hashPassword.js yourpassword
```

Copy the printed `ADMIN_PASSWORD_HASH=...` line.

### 3. Create server/.env

```bash
cp server/.env.example server/.env
```

Fill in your values:

```
ADMIN_PASSWORD_HASH=<paste hash from step 2>
JWT_SECRET=<long random string — e.g. output of: openssl rand -hex 32>
PORT=3001
CLIENT_ORIGIN=http://localhost:5173
```

### 4. Run both servers

Terminal 1 — API server:
```bash
cd server && npm run dev
```

Terminal 2 — Vite dev server:
```bash
cd client && npm run dev
```

Open **http://localhost:5173**

### 5. Configure your start.gg API token

1. Log in at `/login` with your admin password
2. Go to **Settings** tab
3. Paste your start.gg Personal Access Token  
   *(start.gg → top-right menu → Developer → Personal Access Tokens)*

---

## Features

### Public
- Landing page with game cards
- Season leaderboard per game — year-selectable
- Expandable tournament results within each game page
- Points: 1st=100, 2nd=80, 3rd=65, 4th=50, 5th–6th=40, 7th–8th=32, 9th–12th=25, 13th–16th=18, 17th–24th=12, 25th–32nd=8, 33rd+=5

### Admin (`/admin`)
- Import tournaments from start.gg by URL — picks event, assigns game, stores top 64
- Manually add / edit / delete tournaments
- Add / remove games (name + emoji)
- Update start.gg API token

---

## Database

SQLite file lives at `data/esports.db` (created automatically on first run).

| Table | Purpose |
|---|---|
| `games` | Configured games |
| `tournaments` | Tournament records |
| `standings` | Per-player placements + points |
| `settings` | Key/value store (start.gg token) |

---

## Project Structure

```
esports-tracker/
  client/               React + Vite frontend
    src/
      pages/            Home, GameStandings, Login, Admin
      components/       Navbar
      context/          AuthContext (JWT state)
      index.css         All styles (CSS variables, dark theme)
  server/               Express API
    src/
      routes/           auth, games, tournaments, admin
      middleware/       JWT auth guard
      db.js             SQLite setup
      app.js            Entry point
    scripts/
      hashPassword.js   Password hash helper
  data/                 SQLite DB (auto-created, gitignored)
  README.md
```
