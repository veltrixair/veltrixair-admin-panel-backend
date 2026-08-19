# Veltrixair.com — Backend

Backend API for the [veltrixair.com](https://www.veltrixair.com/) corporate site.

**Stack:** NestJS 11 · TypeScript 5.9 · PostgreSQL 17 (Supabase) · TypeORM 0.3 · Swagger

> **Full technical documentation:** [`docs/TECHNICAL-DOCUMENTATION.md`](docs/TECHNICAL-DOCUMENTATION.md) — also available as
> [`docs/Technical-Documentation.pdf`](docs/Technical-Documentation.pdf) (23 pages). Regenerate with `npm run docs:pdf`.
>
> This README is the quick-start; the technical document covers architecture, the full technology
> inventory, data model, security posture, deployment readiness and known gaps.

---

## Contents

- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Project structure](#project-structure)
- [Modules](#modules)
- [API reference](#api-reference)
- [Database and migrations](#database-and-migrations)
- [Conventions](#conventions)
- [Testing](#testing)
- [Not built yet](#not-built-yet)

---

## Getting started

**Prerequisites:** Node.js 20+ (developed on 24), npm 10+, and a PostgreSQL 13+ database. Supabase is what this project uses — no local Postgres install required.

```bash
npm install
cp config/example.env config/dev.env    # then fill in real values
npm run migration:run
npm run start:dev
```

The API listens on `http://localhost:3000`. There is **no global route prefix** — endpoints sit at the root (`/contact/...`, `/careers/...`).

| | URL |
|---|---|
| Swagger UI | http://localhost:3000/api/docs |
| OpenAPI JSON | http://localhost:3000/api/docs-json |
| Postman collection | [`docs/veltrixair.postman_collection.json`](docs/veltrixair.postman_collection.json) |

### Scripts

| Command | Does |
|---|---|
| `npm run start:dev` | watch mode |
| `npm run start:prod` | run the compiled build |
| `npm run build` | compile to `dist/` |
| `npm run lint` | ESLint with `--fix` |
| `npm test` | Jest unit tests |
| `npm run migration:run` | apply pending migrations |
| `npm run migration:revert` | roll back the last migration |
| `npm run migration:show` | list applied / pending |
| `npm run migration:generate -- src/migrations/Name` | diff entities against the DB |

---

## Environment variables

Config lives in `config/`, selected by `NODE_ENV`: `config/prod.env` in production, `config/dev.env` otherwise. Both are gitignored; **`config/example.env` is the only committed copy** and doubles as the template.

Every variable is validated at boot by [`src/config/env.validation.ts`](src/config/env.validation.ts). A missing or malformed value **fails the process immediately** rather than surfacing as a confusing runtime error later.

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV` | ✅ | `development` \| `production` \| `test` |
| `PORT` | ✅ | default 3000 |
| `DB_HOST` `DB_PORT` `DB_USERNAME` `DB_PASSWORD` `DB_NAME` | ✅ | for Supabase, `DB_NAME` is literally `postgres` |
| `DB_SSL` | — | auto-enabled for `*.rds.amazonaws.com`; set `true` for Supabase |
| `CORS_ORIGINS` | ✅ | comma-separated allowlist |
| `THROTTLE_TTL` / `THROTTLE_LIMIT` | — | default 60000 ms / 100 requests |
| `PRIVACY_NOTICE_VERSION` | ✅ | recorded verbatim on every consent |
| `IP_PEPPER` | ✅ | **min 32 chars.** HMAC key for hashing submitter IPs |
| `MAIL_FROM` | ✅ | sender address |
| `TURNSTILE_SECRET` | — | when unset, captcha verification is skipped (local dev) |

> **`IP_PEPPER` must never be rotated once live.** Every stored `ip_hash` becomes unmatchable. Generate with:
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```
> Use a **different** value in dev and prod.

### Connecting to Supabase

Use the **direct connection on port 5432**, not the transaction pooler on 6543 — the pooler doesn't hold session state, which breaks DDL and rejects the `-c timezone=UTC` startup option this app sends.

---

## Project structure

```
config/                     env files by NODE_ENV (dev/prod gitignored)
docs/                       Postman collection
src/
  main.ts                   bootstrap: pipes, interceptor, filter, CORS, Swagger
  app.module.ts
  data-source.ts            TypeORM CLI entrypoint
  config/env.validation.ts  boot-time env schema
  database/
    database.config.ts      shared connection options
    database.module.ts
  migrations/
  common/                   cross-cutting, @Global
    decorators/             @ResponseMessage
    dto/                    PaginationQueryDto, PaginatedResult
    filters/                HttpExceptionFilter (catch-all)
    interceptors/           TransformResponseInterceptor
    services/               ReferenceNumberService, SpamCheckService
    utils/                  business-hours.util (+ spec)
  mail/                     @Global mailer behind a swappable transport
  master-data/              @Global lookup tables
  contact/                  enquiries for /contact-us/
  careers/                  job listings for /careers/
```

### Feature module layout

Each feature module splits its surfaces by filename so *"can an anonymous caller reach this?"* is answerable without reading code:

```
src/contact/
  contact.module.ts
  contact.service.ts              one service
  public-contact.controller.ts    anonymous  → /contact/...
  admin-contact.controller.ts     staff only → /admin/contact/...
  dto/
  entities/
```

---

## Modules

### `common` (@Global)

| Piece | Purpose |
|---|---|
| `business-hours.util` | business-day arithmetic across offices with different working weeks — Riyadh runs Sun–Thu, Dubai and Bangalore Mon–Fri, on three different offsets. Zero dependencies; uses `Intl`. |
| `ReferenceNumberService` | human-readable references (`VLX-2026-000412`) from a Postgres sequence — not `COUNT(*) + 1`, which races |
| `SpamCheckService` | honeypot, Cloudflare Turnstile, disposable-domain list, MX lookup, IP hashing |
| `TransformResponseInterceptor` | wraps every success response in the standard envelope |
| `HttpExceptionFilter` | same envelope shape for errors |

### `master-data` (@Global)

Central lookup tables. All dropdown and filter values are served from here so the frontend never hardcodes options that drift.

`office_masters` · `country_masters` · `industry_masters` · `enquiry_topic_masters` · `enquiry_timeline_masters` · `practice_area_masters` · `job_location_masters`

`office_masters` is not display data — it carries each office's timezone and working days, and is the input to every SLA calculation.

### `contact`

Enquiry submission and triage for `/contact-us/`.

- Reference number issued at submit time
- SLA due date computed on the **owning office's** calendar — the same instant yields a different due date for Riyadh vs Bangalore
- Topic decides the inbox (`contact@` / `voiceai@` / `privacy@`), country decides the office — both held in master data, not in code
- NDA-flagged enquiries omit the message body from notification emails; admin reads are logged as `MESSAGE_VIEWED`
- Suspected spam is **stored with `status: SPAM`, never rejected** — a false positive must not lose a real lead
- `message`, `phone` and `ip_hash` are `select: false`, so list queries can't leak them by omission

### `careers` — Scope A

Job listings for `/careers/`. **Applications and résumé upload are deliberately out of scope**: the live site has no application form and routes everything to `careers@veltrixair.com`.

- 14 roles seeded (`R-001`–`R-014`)
- Filters by practice, location and keyword; a role may span several locations
- Slug-based detail routes, so the site's `#` anchors can become real URLs

---

## API reference

Full request examples are in the Postman collection. Summary:

### Public

| Method | Route | Notes |
|---|---|---|
| `GET` | `/contact/form-options` | all four dropdowns in one response |
| `POST` | `/contact/enquiries` | **5/hour/IP** |
| `GET` | `/careers/filters` | practice + location chips |
| `GET` | `/careers/jobs` | `?practice= &location= &search= &hotOnly= &sort=` |
| `GET` | `/careers/jobs/:slug` | |

### Admin — ⚠ currently unauthenticated

| Method | Route |
|---|---|
| `GET` | `/admin/contact/enquiries` |
| `GET` | `/admin/contact/enquiries/:id` · `/events` |
| `PATCH` | `/admin/contact/enquiries/:id/status` · `/assign` |
| `POST` | `/admin/contact/enquiries/:id/notes` |
| `GET` | `/admin/careers/jobs` · `/:id` |
| `POST` | `/admin/careers/jobs` |
| `PATCH` | `/admin/careers/jobs/:id` · `/status` |
| `DELETE` | `/admin/careers/jobs/:id` |

### Response envelope

Every response — success or error — has the same shape:

```jsonc
{
  "success": true,
  "statusCode": 201,
  "message": "Enquiry received",     // @ResponseMessage() on the handler
  "data": { },                       // null on error
  "timestamp": "2026-08-04T10:15:43.696Z",
  "path": "/contact/enquiries",
  "method": "POST"
}
```

Paginated endpoints return `{ items, total, page, limit, totalPages }` in `data`.

---

## Database and migrations

`synchronize` is **off everywhere**. Schema changes only ever happen through migrations.

```bash
npm run migration:run      # apply — a separate pre-deploy step, never on boot
npm run migration:revert   # roll back the last one
npm run migration:show     # [X] applied, [ ] pending
```

### Applied

| Timestamp | Name | Creates |
|---|---|---|
| `1785801600000` | `CreateContactModule` | 5 masters, `contact_enquiries`, `contact_enquiry_events`, `contact_enquiry_ref_seq` |
| `1785805200000` | `CreateCareersModule` | 2 masters, `job_postings`, `job_posting_locations` |

### Rules

- **Never edit an applied migration.** TypeORM tracks by timestamp, so editing changes nothing on a database that already ran it — your DB and a fresh one silently diverge. Write a new migration instead.
- Review every generated migration by hand. Run `migration:generate` twice; the second run must produce an **empty** migration, or your entities and DB genuinely disagree.
- Migrations here are **hand-written**. Generation diffs decorators against a live database and produces noisy or occasionally destructive SQL — not worth it for anything touching personal data.
- Prefer separate schema and seed migrations for new work.

---

## Conventions

Inherited from `VELTRIX-BACKEND-MAIN` so the two codebases read the same:

- **Entity naming** — `@Entity({ name: 'snake_case_plural' })`, explicit `@Column({ name: 'snake_case' })`
- **Named constraints** — `vtx_<table>_<column>_pk|fk|unique`, indexes `idx_<table>_<column>`
- **Master tables** use an `int` code as the natural key; foreign keys reference the **code column**, not the UUID
- **Housekeeping columns** — `is_active`, `is_deleted`, `deleted_at`, `created_date`, `updated_date`
- **Shared connection builder** — `buildBaseOptions()` feeds both the Nest module and the CLI `DataSource`
- **Response envelope** and `@ResponseMessage()` decorator
- **Env files in `config/`**, selected by `NODE_ENV`

### Deliberate deviations

| | Reference | Here | Why |
|---|---|---|---|
| Timestamps | `timestamp`, session TZ `Asia/Kolkata` | `timestamptz`, session TZ **UTC** | three offices across three offsets; no single local timezone is correct |
| CORS | `origin: true` (reflects any origin) | explicit allowlist | public site with credentialed requests |
| Env | trusted, silent fallbacks | validated at boot | multiple environments drift silently |
| Rate limiting | none | global throttle + per-route limits | anonymous public write endpoints |
| Enums | Postgres enum types | `varchar` + `as const` union + `CHECK` | TypeORM's generated enum migrations are a known rough edge |

### PII handling

The site publicly claims PDPL / DPDP / GDPR alignment, so the backend implements it rather than assuming it:

- Personal-data columns are `select: false` — a list query must **ask** for them
- IPs are HMAC'd with `IP_PEPPER`, never stored raw
- Consent is recorded with a timestamp and the **verbatim policy version**
- Confidential (NDA-flagged) content never travels by email; reads are logged

---

## Testing

```bash
npm test            # unit
npm run test:cov    # coverage
```

15 unit tests currently, all covering `business-hours.util` — the SLA arithmetic is the piece most likely to be subtly wrong, and it's pure, so it's cheap to test thoroughly.

Both modules have also been verified end-to-end against the live Supabase database (26/26 for contact, 24/24 for careers), covering routing, SLA divergence between offices, spam handling, PII containment and pagination.

> `package.json` points `test:e2e` at `./test/jest-e2e.json`, which doesn't exist yet — specs are colocated in `src/`. Harmless until you run that script.

---

## Not built yet

| Gap | Impact |
|---|---|
| **Admin authentication** | ⚠ `/admin/**` routes are open and expose lead PII. **Do not deploy.** Guard locations are marked in the controllers, and `actor` is already threaded through every mutating call so the audit trail is correct the moment real auth lands. |
| **Mail transport** | `MailService` logs instead of sending. Swap `dispatch()` for SES/Resend/Postmark — no caller changes. |
| **Turnstile** | Skipped unless `TURNSTILE_SECRET` is set. Honeypot and MX checks work regardless. |
| **Job applications** | Careers Scope B: applications, résumé upload, virus scanning, hiring pipeline. |
| **Async queue** | Emails send inline after commit. Fine at current volume; BullMQ + Redis when it isn't. |
| **Insights, newsletter, gated downloads, client portal** | Not started. |

### Known open question

The careers page states two different response SLAs — *"within five business days"* for listed roles and *"within ten business days"* for senior applications. Worth settling with whoever owns the copy before building Scope B, since it determines the SLA constant.
