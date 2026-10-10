# نِعمة — Ne'ma

> فائض النهار، رزق لغيرك

Ne'ma is a food rescue platform that connects restaurants and bakeries with
surplus food to verified charities that need food for distribution.

This repository currently contains **Phase 1 and Phase 2**: the project
scaffold — a React frontend and an Express backend with a health-check
endpoint — plus the PostgreSQL database: a schema for users, organizations,
food listings, food requests, and donations, an automated setup script, and
development seed data. No authentication or dashboards yet.

## Tech stack

| Layer      | Choice                          |
| ---------- | ------------------------------- |
| Frontend   | React + Vite                    |
| Backend    | Node.js + Express               |
| Database   | PostgreSQL + `pg`               |
| API        | REST                            |

## Project structure

```
nema/
├── backend/                     # Express REST API
│   ├── .env.example             # copy to .env and edit
│   ├── db/
│   │   └── schema.sql           # the whole database schema (single source of truth)
│   ├── package.json
│   └── src/
│       ├── server.js            # entry point — starts the HTTP server
│       ├── app.js               # builds the Express app (testable, no port)
│       ├── config/              # env + database configuration
│       ├── database/            # pg pool, query helper, schema setup, seed data
│       ├── routes/              # URL → controller wiring, all under /api
│       ├── controllers/         # HTTP concerns only
│       ├── services/            # business logic
│       └── middleware/          # 404 + centralized error handler
│
├── docs/
│   └── database.md              # schema, relationships, and seed data explained
│
└── frontend/                    # React + Vite
    ├── .env.example
    ├── vite.config.js           # dev server + /api proxy
    └── src/
        ├── main.jsx             # entry point
        ├── App.jsx              # route definitions
        ├── layouts/             # page shell (header / nav / footer)
        ├── pages/               # one file per route
        ├── components/          # reusable UI
        ├── services/            # API client
        └── assets/              # styles and static files
```

### Why this layout

- **routes / controllers / services** are split so each layer has one job.
  A route maps a URL to a controller, a controller handles `req`/`res`, and a
  service holds the business logic. Adding a resource means touching all three
  without rewriting any of them.
- **config** is the only place that reads `process.env`, so settings are not
  scattered across the codebase.
- **database** isolates everything that talks to PostgreSQL: the connection
  pool and query helper, plus the schema setup and seed scripts.
- **db/schema.sql** holds the entire schema in one reviewable file. It is
  applied by `npm run db:setup` rather than by hand, so the schema in git and
  the schema in the database cannot drift.
- **middleware** centralizes 404s and error handling instead of repeating
  try/catch in every controller.

## Prerequisites

- Node.js 22.11 or newer
- npm 10+

## Getting started

Install dependencies for both apps:

```bash
cd backend && npm install
cd ../frontend && npm install
```

Create your environment files from the examples:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

> `.env` files are gitignored. Never commit real secrets.

## Running the apps

You need **two terminals** — one per app.

Terminal 1 — backend (Express, port 3001):

```bash
cd backend
npm run dev
```

Terminal 2 — frontend (Vite, port 5173):

```bash
cd frontend
npm run dev
```

Then open <http://localhost:5173>. The home page shows the API status, which
confirms the frontend reaches the backend through the dev proxy.

### Available scripts

| App      | Script         | What it does                                     |
| -------- | -------------- | ------------------------------------------------ |
| backend  | `npm run dev`  | Starts Express with `--watch` auto-reload        |
| backend  | `npm start`    | Starts Express without auto-reload               |
| backend  | `npm run db:setup` | Applies `db/schema.sql` (schema only)        |
| backend  | `npm run db:seed`  | Loads development seed data                  |
| backend  | `npm run db:reset` | Applies the schema **and** seeds the data   |
| frontend | `npm run dev` | Starts the Vite dev server                  |
| frontend | `npm run build` | Builds the frontend for production        |
| frontend | `npm run preview` | Serves the production build locally       |

## Database

Create the database, then load the schema and development seed data:

```bash
createdb nema                  # or via your SQL client
cd backend
npm run db:reset
```

```
Connected to postgres://localhost:5432/nema
Applied schema from db\schema.sql
Seed complete.
Development login password (all seeded users): DevPassword123!

Final state:
  donations        1 row(s)
  food_listings    3 row(s)
  food_requests    3 row(s)
  organizations    4 row(s)
  users            5 row(s)
```

`db/schema.sql` is idempotent — it drops and recreates every object — so
`npm run db:reset` is safe to re-run and always yields a known-clean database.
It covers five tables: `users`, `organizations`, `food_listings`,
`food_requests`, and `donations`, with enum types, foreign keys, CHECK
constraints, and indexes.

See [docs/database.md](docs/database.md) for the entity relationships and the
reasoning behind each constraint.

> **Seeded passwords are bcrypt hashes, never plain text.** The schema itself
> refuses to store anything that does not look like a bcrypt hash.

## API

### `GET /api/health`

Health check for the backend.

```json
{
  "status": "ok",
  "message": "Ne'ma API is running",
  "timestamp": "2026-10-09T17:46:01.795Z",
  "uptime": 63.66
}
```

Unknown routes return `404` with a JSON error body.

```bash
curl http://localhost:3001/api/health
```

## Environment variables

### Backend (`backend/.env`)

| Variable        | Default                    | Purpose                          |
| --------------- | -------------------------- | -------------------------------- |
| `PORT`          | `3001`                     | Port the API listens on          |
| `NODE_ENV`      | `development`              | Environment name                 |
| `DATABASE_URL`  | `postgres://localhost:5432/nema` | PostgreSQL connection string — read by the app and by `npm run db:setup` |

### Frontend (`frontend/.env`)

| Variable           | Default | Purpose                                      |
| ------------------ | ------- | -------------------------------------------- |
| `VITE_API_BASE_URL`  | `/api`  | Base URL for API calls. Keep `/api` in dev — the Vite dev server proxies it to the backend, so no CORS setup is needed. |

## How requests flow in development

```
Browser  →  Vite dev server (:5173)  →  /api/* proxied  →  Express (:3001)
```

The Vite dev server forwards any `/api` request to the backend, so the browser
only talks to one origin. This avoids CORS configuration during development.

## Roadmap

- [x] Phase 1 — project scaffold, health check, database groundwork
- [x] Phase 2 — PostgreSQL schema, setup script, and seed data
- [ ] Phase 3 — JWT authentication and roles
- [ ] Phase 4 — food listings and matching
- [ ] Phase 5 — charity and restaurant dashboards
