# Banjo Tabs

A full-stack web app for creating, browsing, and playing back 5-string banjo
tablature -- built with an old-timey, "log cabin" aesthetic.

## Features

- **Tab editor**: add notes one at a time (pick a string, type/click a fret
  number), attach lyrics to specific notes, and mark line breaks. Lyrics
  render below each line of tab.
- **Automatic playback**: a Web Audio API plucked-string (Karplus-Strong)
  synth plays the tab back note-by-note, with adjustable tempo and
  transposition (e.g. "standard G, tuned down 1 fret").
- **Auto-scroll**: adjustable-speed auto-scroll while playing, like a
  teleprompter.
- **Drafts + publishing**: logged-in users can save drafts and publish later.
  Anonymous visitors can create tabs too, but they're published immediately
  under the username "Anonymous" (no drafts, no voting).
- **Voting**: thumbs-up only (no downvotes), one vote per user per tab.
- **Search**: search published tabs by song name, sorted by vote count.
- **User profiles**: browse a specific user's published tabs.
- **Tuner**: microphone-based pitch detection (autocorrelation), compared
  against the selected tuning (with optional transposition), with a simple
  sharp/flat meter.
- **Auth**: username/password (Argon2id-hashed) and Google OAuth2 (authorization
  code flow), with short-lived JWT access tokens and rotating refresh tokens.

## Tech stack

- **Backend**: FastAPI, SQLAlchemy (async) + PostgreSQL, `msgspec` for
  strictly-typed request/response schemas (not Pydantic), Argon2id password
  hashing, PyJWT, Alembic migrations.
- **Frontend**: React + TypeScript (Vite), React Router, Web Audio API,
  hand-written CSS (no UI framework) for the wood-cabin theme.
- **Tests**: Pytest (backend, async SQLite), Vitest + Testing Library
  (frontend).

## Project layout

```
backend/
  app/
    api/         # FastAPI routers (auth, tabs, users)
    core/        # config, database, security, tunings, msgspec helpers
    models/      # SQLAlchemy ORM models
    schemas/     # msgspec Struct request/response schemas
    services/    # converters, audio theory, Google OAuth2
  alembic/       # DB migrations
  tests/         # pytest test suite
frontend/
  src/
    components/  # TabEditor, TabRenderer, PlaybackControls, TunerPanel, ...
    pages/       # route-level pages
    hooks/       # useAuth, useTuner
    lib/         # apiClient, audioTheory, playbackEngine, pitchDetection, ...
    styles/      # theme.css (log-cabin/wood theme)
    test/        # vitest unit + component tests
```

## Getting started (local development)

### Backend

```powershell
cd backend
python -m venv venv
.\venv\Scripts\pip install -r requirements.txt
copy .env.example .env   # then fill in real values
.\venv\Scripts\python -m uvicorn app.main:app --reload
```

By default (no `DATABASE_URL` set) the backend falls back to a local SQLite
file for convenience; set `DATABASE_URL` to a PostgreSQL connection string
for anything beyond quick local testing. Set `ENVIRONMENT=development` to
auto-create tables on startup; otherwise, manage schema with Alembic:

```powershell
alembic revision --autogenerate -m "message"
alembic upgrade head
```

Run tests:

```powershell
.\venv\Scripts\python -m pytest
```

### Frontend

```powershell
cd frontend
npm install
copy .env.example .env   # then fill in real values (at least VITE_API_BASE_URL)
npm run dev
```

Run tests / type-check / build:

```powershell
npm run test -- --run
npm run build
```

## Deployment notes (AWS free tier)

This app is designed to fit comfortably on AWS free-tier resources:

- **Backend**: an EC2 `t2.micro`/`t3.micro` instance running the FastAPI app
  behind `uvicorn`/`gunicorn` (or a small container).
- **Database**: an RDS PostgreSQL `db.t3.micro` (free-tier eligible) instance.
- **Frontend**: a static build (`npm run build`) served from S3 + CloudFront,
  or from the same EC2 instance.

All configuration is environment-driven (see `backend/.env.example` and
`frontend/.env.example`) -- no secrets or hostnames are hard-coded anywhere
in the source.

## Security notes

- Passwords are hashed with Argon2id (OWASP's current recommendation), never
  stored in plaintext.
- Refresh tokens are stored server-side only as SHA-256 hashes and rotate on
  each use.
- Access tokens are short-lived signed JWTs.
- Google OAuth2 uses the standard authorization-code flow; client secrets
  never touch the frontend.
