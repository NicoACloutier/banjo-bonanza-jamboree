# Banjo Bonanza Jamboree

A full-stack web app for creating, browsing, and playing back 5-string banjo
tablature, with an added tuner.

## Features

- **Tab editor**: add notes one at a time (pick a string, type/click a fret
  number), attach lyrics to specific notes, and mark line breaks. Lyrics
  render below each line of tab.
- **Automatic playback**: a Web Audio API plucked-string (Karplus-Strong)
  synth plays the tab back note-by-note, with adjustable tempo and
  transposition.
- **Auto-scroll**: adjustable-speed auto-scroll while playing, like a
  teleprompter.
- **Voting**: users can vote on their preferred tabs.
- **Search**: search published tabs by song name, sorted by vote count.
- **User profiles**: browse a specific user's published tabs. Login not
  necessary to use software or create a tab.
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
