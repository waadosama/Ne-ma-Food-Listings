# نِعمة — Ne'ma

> فائض النهار، رزق لغيرك

Ne'ma is a food rescue platform that connects restaurants and bakeries with
surplus food to verified charities that need food for distribution.

This repository currently contains **Phase 1**: the project scaffold — a React
frontend, an Express backend, a health-check endpoint, and the structure needed
for PostgreSQL integration in the next phase. No authentication, data models,
or dashboards yet.

## Tech stack

| Layer      | Choice                          |
| ---------- | ------------------------------- |
| Frontend   | React + Vite                    |
| Backend    | Node.js + Express               |
| Database   | PostgreSQL (next phase)         |
| API        | REST                            |

## Project structure

```
nema/
├── backend/                     # Express REST API
│   ├── .env.example             # copy to .env and edit
│   ├── package.json
│   └── src/
│       ├── server.js            # entry point — starts the HTTP server
│       ├── app.js               # builds the Express app (testable, no port)
│       ├── config/              # env + database configuration
│       ├── database/            # pg pool + query helper (next phase)
│       ├── routes/              # URL → controller wiring, all under /api
│       ├── controllers/         # HTTP concerns only
│       ├── services/            # business logic
│       └── middleware/          # 404 + centralized error handler
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
- **database** is isolated so PostgreSQL can be wired in during the next phase
  without changing routes or services.
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

| App      | Script        | What it does                                |
| -------- | ------------- | ------------------------------------------- |
| backend  | `npm run dev` | Starts Express with `--watch` auto-reload   |
| backend  | `npm start`   | Starts Express without auto-reload          |
| frontend | `npm run dev` | Starts the Vite dev server                  |
| frontend | `npm run build` | Builds the frontend for production        |
| frontend | `npm run preview` | Serves the production build locally       |

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
| `DATABASE_URL`  | `postgres://localhost:5432/nema` | PostgreSQL connection string (next phase) |

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
- [ ] Phase 2 — PostgreSQL schema, models, and CRUD
- [ ] Phase 3 — JWT authentication and roles
- [ ] Phase 4 — food listings and matching
- [ ] Phase 5 — charity and restaurant dashboards
