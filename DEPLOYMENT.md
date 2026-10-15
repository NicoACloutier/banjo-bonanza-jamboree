# Deploying Banjo Bonanza Jamboree

The setup:

| Part | Where | Cost |
|---|---|---|
| Frontend (static site) | Cloudflare Pages | Free |
| Backend (FastAPI) | Fly.io, one always-on `shared-cpu-1x` machine with 512 MB | About $3-4/month |
| Database (PostgreSQL) | Neon, free plan | Free (0.5 GB is plenty for tabs) |
| Email (verification and password reset links) | Any SMTP provider, e.g. Brevo's free plan | Free (300 emails a day) |
| Domain name | Optional | About $10-20/year |

Prices change; check each provider's pricing page. Fly.io needs a credit card
on file.

What's already in the repo for this:

- `backend/Dockerfile`, `backend/.dockerignore`, `backend/fly.toml`: the backend
  container and Fly.io app config. Each deploy runs `alembic upgrade head` first,
  so the database schema is always up to date.
- `backend/alembic/versions/`: database migrations (`0001` creates every table).
- `frontend/public/_headers`: Cloudflare Pages cache headers (the service worker
  is never cached; hashed bundles are cached for a year).
- `.github/workflows/backend.yml`: runs the backend tests on every push, and
  deploys to Fly.io from `main` once you add a `FLY_API_TOKEN` secret (step 7).


## 1. Create the database (Neon)

1. Sign up at https://neon.tech and create a project. Pick the region closest to
   where you'll run the backend (e.g. **AWS US East (N. Virginia)** pairs with
   Fly's `iad` region).
2. On the project dashboard, open **Connect**, turn **off** "Connection pooling",
   and copy the connection string. It looks like:
   `postgresql://user:password@ep-something.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require`

   Use it as-is: the backend converts it for its database driver. Use the
   **unpooled** string: Neon's pooled endpoint (host containing `-pooler`)
   breaks the driver's prepared statements.


## 2. Deploy the backend (Fly.io)

1. Install the Fly CLI (https://fly.io/docs/flyctl/install/) and log in:
   ```
   fly auth login
   ```
2. In `backend/fly.toml`, change `app = "banjo-bonanza-jamboree-api"` to a name
   that's free on Fly (it becomes `https://<name>.fly.dev`), and set
   `primary_region` to match your Neon region if it isn't `iad`.
3. From the `backend/` folder, create the app without deploying yet:
   ```
   fly apps create <name>
   ```
4. Set the secrets. Generate a JWT secret first (never reuse your local one):
   ```
   python -c "import secrets; print(secrets.token_hex(32))"
   fly secrets set \
     DATABASE_URL="<your Neon connection string>" \
     JWT_SECRET_KEY="<the generated secret>" \
     CORS_ORIGINS="https://<your-pages-project>.pages.dev"
   ```
   You'll know the Pages address after step 3; it's fine to set CORS_ORIGINS now
   with the name you plan to use and change it later.
5. Deploy:
   ```
   fly deploy
   ```
   Fly builds the image, runs the database migrations, then starts the app.
6. Check it's up:
   ```
   curl https://<name>.fly.dev/api/health      # {"status":"ok"}
   ```
   If not, `fly logs` shows what went wrong (migration errors appear under the
   "release" step).


## 3. Deploy the frontend (Cloudflare Pages)

1. In the Cloudflare dashboard: **Workers & Pages -> Create -> Pages -> Connect
   to Git**, and pick this GitHub repository.
2. Build settings:
   - Production branch: `main`
   - Framework preset: `React (Vite)` (or None)
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Root directory: `frontend`
3. Environment variables (Settings -> Variables and Secrets, for Production):
   - `VITE_API_BASE_URL` = `https://<name>.fly.dev` (no trailing slash)
   - `NODE_VERSION` = `22`
   - (Google sign-in only) `VITE_GOOGLE_CLIENT_ID` and
     `VITE_GOOGLE_REDIRECT_URI` = `https://<project>.pages.dev/auth/google/callback`
4. Save and deploy. The site is served at `https://<project>.pages.dev`.

`VITE_*` values are baked into the build, so after changing one, redeploy the
site (Deployments -> ... -> Retry deployment).

Page routing needs nothing extra: with no `404.html` in the build, Pages serves
`index.html` for every path, so links like `/tabs/<id>` work.


## 4. Connect the two

Make sure the backend allows the site's exact address (no trailing slash):
```
fly secrets set CORS_ORIGINS="https://<project>.pages.dev"
```
Setting a secret restarts the app. To also allow Cloudflare's preview
deployments (`https://<hash>.<project>.pages.dev`, built for other branches):
```
fly secrets set CORS_ORIGIN_REGEX='^https://([a-z0-9-]+\.)?<project>\.pages\.dev$'
```
Then open the site, register an account and create a tab.

To make that account an admin (admins get a Delete button on every tab, for
removing spam or abuse), run in `backend/`:
```
fly ssh console -C "python -m app.cli make-admin <username>"
```
Add `--revoke` to take admin rights away again. Locally, run
`python -m app.cli make-admin <username>` in `backend/` instead.


## 5. Google sign-in (optional)

Username/password login works without this.

1. In Google Cloud Console -> APIs & Services -> Credentials, create (or edit) an
   OAuth client ID of type "Web application". Add the authorized redirect URI
   `https://<project>.pages.dev/auth/google/callback`.
2. Backend: `fly secrets set GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=...
   GOOGLE_REDIRECT_URI=https://<project>.pages.dev/auth/google/callback`
3. Frontend: set `VITE_GOOGLE_CLIENT_ID` and `VITE_GOOGLE_REDIRECT_URI` (same
   redirect URI) on Pages and redeploy.


## 6. Email (verification and password reset)

New accounts get an email with a link to verify their address, and "Forgot
your password?" emails a reset link, so the backend needs an SMTP server to
send from. **Set this up before people register:** until they open the link,
new accounts can browse and save favorites but can't post tabs or vote, and
without email the link never arrives. (Accounts that existed before email
verification was added count as verified, as do Google sign-ins Google has
verified.) Any provider works; Brevo (300 emails a day) and Resend
(100 a day, needs a domain you own) both have free tiers. Get the SMTP
details from your provider, then:
```
fly secrets set \
  SMTP_HOST="smtp-relay.brevo.com" SMTP_PORT=587 SMTP_SECURITY=starttls \
  SMTP_USERNAME="<smtp login>" SMTP_PASSWORD="<smtp key>" \
  EMAIL_FROM="Banjo Bonanza Jamboree <noreply@your-domain.com>" \
  FRONTEND_URL="https://<project>.pages.dev"
```
Use `SMTP_PORT=465 SMTP_SECURITY=ssl` if your provider only offers SSL.
`FRONTEND_URL` is the site address the links point to; it defaults to the first
`CORS_ORIGINS` entry. Without `SMTP_HOST` no email is sent (the server logs say
so); locally, the email is printed in the backend's output instead, so you can
copy the link from there.

If someone's email never arrives, you can verify them by hand, in `backend/`:
```
fly ssh console -C "python -m app.cli verify-email <username>"
```


## 7. Automatic deploys

- **Frontend**: Cloudflare Pages rebuilds on every push to `main`, and builds a
  preview for other branches.
- **Backend**: the `Backend` GitHub Action runs the tests on every push. To have
  it deploy `main` to Fly when they pass:
  ```
  fly tokens create deploy       # run in backend/; copy the token
  ```
  Then in GitHub: repository Settings -> Secrets and variables -> Actions ->
  New repository secret, named `FLY_API_TOKEN`.


## 8. Custom domain (optional)

- Frontend: Pages project -> Custom domains -> add e.g. `banjo.example.com`.
- Backend: `fly certs add api.example.com`, then add the DNS records it prints
  (a CNAME to `<name>.fly.dev`).
- Update `VITE_API_BASE_URL` (redeploy Pages), `CORS_ORIGINS`, and any Google
  redirect URIs to the new addresses.


## Changing the database schema from now on

Production only changes its schema through migrations. After changing the
models in `backend/app/models/orm.py`:

```
cd backend
# Generate a migration by comparing the models to a scratch database at the latest migration:
DATABASE_URL=sqlite+aiosqlite:///./scratch.db python -m alembic upgrade head
DATABASE_URL=sqlite+aiosqlite:///./scratch.db python -m alembic revision --autogenerate -m "describe the change"
rm scratch.db
```

(On Windows PowerShell, set `$env:DATABASE_URL = "sqlite+aiosqlite:///./scratch.db"`
first instead.) Review the new file in `alembic/versions/`, commit it, and the
next deploy applies it. The backend test `test_migrations_build_exactly_the_models_schema`
fails if a model change has no migration.

Local development still creates tables automatically (`ENVIRONMENT=development`)
and doesn't use the migrations.


## Troubleshooting

- **The site loads but nothing works / "Failed to fetch"**: usually CORS. The
  browser console says which origin was blocked; make `CORS_ORIGINS` match it
  exactly (scheme and host, no trailing slash). Also check `VITE_API_BASE_URL`.
- **Errors mentioning prepared statements**: use Neon's unpooled connection
  string (see step 1).
- **Deploy fails at the release step**: the migration failed; `fly logs` shows the
  error. The previous version keeps running.
- **App restarts under load**: check `fly logs` for out-of-memory errors.
  Password hashing uses 64 MB per login, which is why the machine has 512 MB.
