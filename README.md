# ChaseHorse Outreach

Lead discovery, company research, qualification and email outreach for the ChaseHorse logistics sales team.

Find companies in [Enricho](https://enricho.co) → research them with Gemini (provider facts, cited web findings and AI analysis kept apart) → find decision-makers and their contact details → score the lead → draft a personalised email → approve → send from your own Gmail → track replies, follow-ups and the pipeline.

Every user brings their own Enricho and Gemini credentials and connects their own Google account. Nothing is sent without explicit approval.

---

## Architecture

```
browser ──► Next.js 14 (frontend, :3000) ──/api/* proxy──► Express API (backend, :5000)
                                                           │
                         ┌─────────────────────────────────┼──────────────────────────────┐
                         ▼                                 ▼                              ▼
                  PostgreSQL 16 (:5434)              Redis 7 (:6381)              External providers
                  Prisma ORM, per-user data          cache, rate limits,          • Enricho MCP (Streamable HTTP)
                                                     BullMQ reply-sync job        
                                                                                  • Gemini REST
                                                                                  • Gmail / Calendar APIs
```

The browser only talks to the Next.js origin. `/api/*` is proxied to Express, so the session cookie is first-party and HTTP-only, and no keys or tokens ever reach frontend code.

```
backend/src
  config/          environment loading and validation (fails fast on missing secrets in production)
  middleware/      auth (JWT cookie), CSRF/origin guard, zod validation, rate limiting, error handler
  integrations/
    enricho/       MCP client, OAuth provider (DCR + PKCE), schema-driven arg builder, normalizers
    gemini.client  generateContent with JSON schema output and Google Search grounding
    google.client  OAuth (incremental Gmail/Calendar scopes), send, thread read, calendar events
  services/        business logic: discovery, people, research, scoring, email, leads, follow-ups, campaigns, analytics
  controllers/     HTTP handlers + request validation
  routes/          route table
  jobs/            BullMQ repeatable job: reply detection
backend/prisma     schema, migrations, seed
backend/tests      vitest + supertest (external providers mocked)
frontend/src
  app/(auth)       sign in / register
  app/(app)/…      dashboard, discover, companies, research, people, leads, pipeline, follow-ups, emails, campaigns, analytics, settings
  components/      design system (ui.tsx), draft editor, research view, charts, app shell
```

## Quick start (Windows + Docker Desktop)

Prerequisites: Docker Desktop, Node.js 20+.

```powershell
# 1. Configuration
copy .env.example .env
#    then set ENCRYPTION_KEY and JWT_SECRET (generator commands are in the file)

# 2a. Everything in Docker
docker compose --profile app up -d --build
#     web  http://localhost:3000     API  http://localhost:5000/api/health

# 2b. Or: database in Docker, app on your machine (hot reload)
docker compose up -d postgres redis
npm run install:all
npm run db:migrate
npm run dev
```

Open http://localhost:3000, create an account, and you land on **Settings → Integrations**.

Host ports are chosen to avoid clashing with other local projects: **PostgreSQL 5434, Redis 6381, API 5000, web 3000**. Data lives in the named volumes `chasehorse_pg` and `chasehorse_redis`.

### Database

| Task | Command |
|---|---|
| Apply migrations (deploy) | `npm --prefix backend run db:deploy` |
| Create a migration after editing `schema.prisma` | `npm --prefix backend run db:migrate -- --name <change>` |
| Open Prisma Studio | `npm --prefix backend run db:studio` |
| Optional demo account | `SEED_EMAIL=you@x.com SEED_PASSWORD='long-password' npm run db:seed` |

The Docker backend runs `prisma migrate deploy` on start. The seed creates one account with ChaseHorse's service catalogue and business description. It creates **no** companies, contacts or emails: prospect data only comes from Enricho or from you.

### Tests

```powershell
docker compose up -d postgres     # tests use a separate chasehorse_test database on :5434
docker exec chasehorse_postgres psql -U postgres -c "CREATE DATABASE chasehorse_test"   # first time only
npm test
```

No API keys are needed: Enricho, Gemini and Google are mocked. The Enricho tool schemas in `backend/tests/fixtures/enricho-tools.json` were written from docs.enricho.co, because Enricho requires a key even to list tools. At runtime the app always uses the live schemas.

## Credentials

### Per user (entered in the app, Settings → Integrations)

| Provider | What it is used for | How to get it |
|---|---|---|
| **Enricho** | Company search and lookup, people search, contact details (email/phone) | `enr_…` API key from https://app.enricho.co/keys, **or** "Sign in with Enricho" (email + 6-digit code, OAuth) |
| **Google Gemini** | Research (with Google Search grounding), lead scoring, email drafting | https://aistudio.google.com/apikey |
| **Google account** | Gmail send + reply detection; Calendar events for follow-ups | "Connect Gmail" / "Connect Calendar" (OAuth) |

Keys are validated against the provider before they are saved, encrypted with AES-256-GCM (`ENCRYPTION_KEY`), shown only as `••••1234`, and never returned by the API or logged.

### Application level (`.env`)

| Variable | Purpose |
|---|---|
| `ENCRYPTION_KEY` | 64 hex chars. Encrypts stored keys and tokens. Rotating it invalidates stored credentials. |
| `JWT_SECRET` | ≥32 chars. Signs session cookies. |
| `APP_URL` | Public URL of the web app (default `http://localhost:3000`). OAuth redirect URIs are built from it. |
| `DATABASE_URL`, `REDIS_URL` | Defaults match docker-compose. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | The OAuth client for Gmail/Calendar (see below). |

## OAuth setup

### Google (Gmail + Calendar)

1. Google Cloud Console → create or select a project.
2. **APIs & Services → Library**: enable **Gmail API** and **Google Calendar API**.
3. **OAuth consent screen**: user type *External* (or *Internal* for a Workspace org). Add the scopes `openid`, `.../auth/userinfo.email`, `.../auth/gmail.send`, `.../auth/gmail.readonly`, `.../auth/calendar.events`. While the app is in *Testing*, add each user's Google address under **Test users**.
4. **Credentials → Create credentials → OAuth client ID → Web application**. Authorized redirect URI:
   `http://localhost:3000/api/integrations/google/callback` (replace the origin with your `APP_URL` in other environments).
5. Put the client ID and secret in `.env`, restart the backend.

`gmail.readonly` and `gmail.send` are *restricted* scopes. For use beyond your own test users, Google requires app verification (and a security assessment for restricted scopes). The Privacy Policy at `/privacy` covers the Limited Use disclosure but has placeholders for operator details.

### Enricho (MCP OAuth)

Nothing to configure. The MCP server advertises OAuth with dynamic client registration and PKCE, scope `mcp` (`https://mcp.enricho.co/.well-known/oauth-authorization-server`). The app registers itself and sends you to `https://mcp.enricho.co/oauth/authorize`, where you sign in with your email and a 6-digit code. The redirect URI it registers is `${APP_URL}/api/integrations/enricho/oauth/callback`.

## How the Enricho integration works

Provider: **Enricho** (https://enricho.co, docs https://docs.enricho.co).

- **Transport:** MCP Streamable HTTP via `@modelcontextprotocol/sdk` to `https://mcp.enricho.co/mcp`.
- **Auth:** `Authorization: Bearer enr_…` API key, or MCP OAuth. Both are per user.
- **Validation:** when you save a key, the app lists tools and calls the free `account_usage` tool. An invalid key is rejected and never stored.
- **Tools used** (names taken from the live `tools/list`):
  - `company_search` for discovery and refreshing a company by domain
  - `person_search` for decision-makers and, as a full record, their email and phone
  - `account_usage` for the credit balance
- **Arguments come from each tool's live input schema.** Only declared parameters are sent, and rejected enum values are dropped and reported in the UI.
  - `company_search` has no keyword or city field. Its `query` matches words in the name, website, industry, country or address, so keywords and city names go there.
  - Enricho has no funding or revenue filters, so the UI doesn't offer them.
- **Cost-aware flow:**
  1. Free preview: up to 3 records, no contact details, 100 previews a day.
  2. Explicit paid full search: 5 credits per new record, and the UI shows the maximum cost and asks first.
  3. Load more: Enricho's `next_page.arguments` are passed back unchanged.
  Results are cached server-side for 6 hours, so saving uses Enricho's data, not data sent by the browser.
- **Errors:** Enricho's documented messages map to clear errors:
  - 401 / "Sign in to Enricho": reconnect
  - 402 / "You don't have enough credits": nothing was charged
  - 429: rate limit (60 MCP requests per minute) or the daily preview allowance
  There is no simulation or demo-data fallback anywhere.

## Data provenance

| Label in UI | Meaning |
|---|---|
| `ENRICHO` | Field returned by the Enricho provider |
| `ENTERED BY YOU` | Entered or edited manually |
| `WEB, CITED` | Statement from Gemini Google Search grounding, linked to the URLs Google attributed it to. Unattributed statements are discarded. |
| `AI ANALYSIS` | Gemini interpretation. Each point lists the facts or findings it relied on. |
| `UNKNOWN` | Not available from any source |

Emails returned by Enricho are labelled **"From Enricho · <email_type>"** using Enricho's own `email_type`. They are never marked "verified", and a listed email is not guaranteed to be deliverable. Emails you type are "Unverified".

Lead scores are a weighted average of seven factors, each 0–10 with reasoning. "Contact availability" is computed from your data, and the others come from Gemini. A factor with insufficient data counts as neutral, so missing information alone never makes a lead "Not a fit". You can override any score with a reason, and history is kept.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `port is already allocated` for 5434 | Another container uses it (on this machine `creditguard-db` is mapped to 5434 when running). Stop it, or change the left side of `"5434:5432"` and `DATABASE_URL`. |
| `Bind for 0.0.0.0:3000 failed: port is already allocated` although nothing listens on 3000 | Docker Desktop kept a stale reservation. Restart Docker Desktop, or run the web container on another port: `$env:WEB_PORT=3001; $env:APP_URL="http://localhost:3001"; docker compose --profile app up -d` (and update the Google redirect URI to match). |
| API exits with `Missing required environment variable ENCRYPTION_KEY` | Set it in `.env` (64 hex chars). |
| Settings page shows "Google OAuth is not configured" | Set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` and restart. |
| Google says `redirect_uri_mismatch` | The authorized redirect URI must exactly equal `${APP_URL}/api/integrations/google/callback`. |
| Google says the app is unverified / access blocked | Add your Google account as a Test user on the consent screen. |
| Enricho: "rejected the credentials" | Wrong or revoked `enr_` key; create a new one at app.enricho.co/keys. With OAuth, sign in again. |
| Enricho: "not enough credits" (402) | Nothing was charged. Lower the page size, wait for the monthly refill (1st, UTC), or buy credits in Enricho. |
| Enricho: "rate limit or daily free-preview allowance" (429) | 60 MCP requests/min per account; 100 free previews/day. Wait, or run a paid full search. |
| Gemini: "quota or rate limit" | Free-tier limits; wait or enable billing in AI Studio. Grounded research uses more quota. You can turn grounding off in Settings. |
| "These search results have expired" | Results are cached for 6 hours; run the search again. |
| Frontend in Docker cannot reach the API | `BACKEND_INTERNAL_URL` is baked in at build time; rebuild with `docker compose --profile app build frontend`. |
| `prisma generate` fails with EPERM on Windows | A running dev server holds the engine DLL. Stop it and retry. |
