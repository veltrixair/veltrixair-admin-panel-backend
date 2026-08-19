# Veltrixair.com — Backend

## Technical Documentation

| | |
|---|---|
| **Project** | Veltrixair.com Backend API |
| **Version** | 0.0.1 |
| **Status** | Initial setup — Contact and Careers modules delivered |
| **Runtime target** | Node.js 20 LTS or later |
| **Document date** | 4 August 2026 |

---

## 1. Overview

### 1.1 Purpose

This service is the backend for the [veltrixair.com](https://www.veltrixair.com/) corporate website. Veltrixair is an AI-led enterprise services firm operating across three jurisdictions — Riyadh (KSA), Dubai (UAE) and Bangalore (India) — delivering custom software, platform engineering, cybersecurity, privacy advisory, managed IT and business applications.

The backend serves the public marketing site and the internal tooling behind it. It is **not** a product API; its traffic profile is anonymous, read-heavy, public-internet traffic with a small number of unauthenticated write endpoints.

### 1.2 Scope of this release

| Module | Status | Covers |
|---|---|---|
| Contact | Delivered | Enquiry capture and triage for `/contact-us/` |
| Careers | Delivered (Scope A) | Job listings for `/careers/` |
| Insights | Delivered (cards only) | Article card grid for `/insights/` |
| Discovery | Delivered (Phase 1) | 45-minute architect sessions for `/talk-to-architect/` |
| Master data | Delivered | Lookup tables shared across modules |
| Common | Delivered | Cross-cutting services and HTTP primitives |
| Mail | Delivered (stub transport) | Transactional email behind a swappable seam |

Not in this release: identity and RBAC, job applications and résumé upload, insights/blog, newsletter, gated downloads, client portal.

### 1.3 Design drivers

Three characteristics of the business shape the architecture more than anything else.

**Multi-jurisdiction operation.** Three offices on three UTC offsets, one of which (Riyadh) works Sunday–Thursday while the other two work Monday–Friday, and one of which (Bangalore) sits on a half-hour offset. Any "respond within N business days" commitment resolves to a different instant per office. This is handled explicitly rather than approximated.

**Public regulatory claims.** The site publicly states alignment with KSA PDPL, India DPDP 2023, UAE DP Law and GDPR, and displays *"Encrypted in transit · stored in EU/KSA region"* on the contact page. Personal-data handling is therefore implemented as a first-class concern, not retrofitted.

**Anonymous public write endpoints.** The contact form is an unauthenticated POST on a public site. It will be discovered by scrapers. Abuse resistance is a functional requirement.

---

## 2. Technology stack

### 2.1 Runtime and language

| Technology | Version | Purpose |
|---|---|---|
| Node.js | 24.13.0 (dev) | JavaScript runtime. Target 20 LTS or later in production. |
| TypeScript | 5.9.3 | Language. `strictNullChecks`, `noImplicitAny`, `isolatedModules` enabled. |
| PostgreSQL | 17.6 | Primary datastore, hosted on Supabase. |

### 2.2 Application framework

| Package | Version | Purpose |
|---|---|---|
| `@nestjs/core` `@nestjs/common` | 11.1.28 | Application framework — DI container, module system, HTTP pipeline. |
| `@nestjs/platform-express` | 11.1.28 | Express HTTP adapter. |
| `@nestjs/config` | 4.0.4 | Environment configuration with boot-time validation. |
| `@nestjs/swagger` | 11.4.6 | OpenAPI generation, including the CLI plugin that infers schemas from DTOs. |
| `@nestjs/throttler` | 6.5.0 | Rate limiting, applied globally and tightened per route. |
| `rxjs` | 7.8.2 | Observable pipeline used by interceptors. |
| `reflect-metadata` | 0.2.2 | Decorator metadata, required by DI and validation. |

**Why NestJS.** Opinionated module boundaries and first-class dependency injection make the public/admin separation enforceable rather than conventional. The interceptor and filter pipeline gives one place to apply the response envelope and error shape across every route.

### 2.3 Persistence

| Package | Version | Purpose |
|---|---|---|
| `typeorm` | 0.3.31 | ORM and migration tooling. |
| `@nestjs/typeorm` | 11.0.3 | Nest integration — `forRootAsync`, repository injection. |
| `pg` | 8.22.0 | PostgreSQL driver. |

**Why TypeORM over Prisma.** Both were evaluated. TypeORM was selected for consistency with the organisation's existing healthcare backend, and because `EntitySubscriber` combined with AsyncLocalStorage gives request-aware audit logging inside the same transaction as the change — a pattern that matters for a firm selling compliance. The trade-off accepted is that TypeORM does not narrow return types on `select`, which is mitigated by `select: false` on personal-data columns (see §9.2).

### 2.4 Validation and serialisation

| Package | Version | Purpose |
|---|---|---|
| `class-validator` | 0.15.1 | DTO validation via decorators; also validates environment variables at boot. |
| `class-transformer` | 0.5.1 | Payload transformation and type coercion. |
| `dotenv` | 17.4.2 | Loads `config/*.env` for the standalone TypeORM CLI. |

### 2.5 Tooling

| Package | Version | Purpose |
|---|---|---|
| `@nestjs/cli` | 11.0.24 | Build and scaffolding. |
| `jest` | 30.4.2 | Test runner. |
| `ts-jest` | 29.4.12 | TypeScript transform for Jest. |
| `supertest` | 7.2.2 | HTTP assertions for end-to-end tests. |
| `eslint` | 9.39.5 | Linting, flat config. |
| `typescript-eslint` | 8.66.0 | TypeScript rules, type-checked ruleset. |
| `prettier` | 3.9.6 | Formatting, enforced through ESLint. |

### 2.6 Deliberately absent

Choices worth recording because their absence is intentional:

| Not used | Reason |
|---|---|
| Redis / BullMQ | Email volume does not yet justify a broker. Mail is dispatched inline after commit. Required before horizontal scaling — see §14.2. |
| GraphQL | Read patterns are fixed and shallow. REST with generated OpenAPI covers them. |
| Headless CMS | An admin API is required for leads and jobs regardless; content tables in the same database avoid operating a second system and keep content inside the same residency boundary as personal data. |
| Date library (Luxon, date-fns) | Business-day arithmetic is implemented against the `Intl` API, which already carries the IANA timezone database. No dependency, fully unit-tested. |
| Postgres `ENUM` types | TypeORM's generated migrations for enum value changes are a known rough edge. Constrained `varchar` columns with `as const` unions are used instead. |

---

## 3. Architecture

### 3.1 Deployment shape

A single deployable Node process connecting to a managed PostgreSQL instance. Deliberately a modular monolith: traffic is that of a corporate marketing site, and microservice boundaries would add operational cost without addressing any current constraint.

```
   Browser ──HTTPS──▶  Veltrixair Backend (NestJS)  ──TLS──▶  PostgreSQL (Supabase)
                              │
                              ├──▶ Cloudflare Turnstile   (captcha verification)
                              ├──▶ DNS resolver           (MX validation)
                              └──▶ Mail transport         (stubbed in this release)
```

### 3.2 API surfaces

Routes are separated into two surfaces with different trust assumptions:

| Surface | Prefix | Authentication | Rate limit |
|---|---|---|---|
| Public | `/contact/…`, `/careers/…` | None | Global, plus per-route limits on writes |
| Admin | `/admin/…` | **Not yet implemented** | Global |

Each feature module implements these as **separate controller files** sharing one service, so whether an endpoint is publicly reachable is answerable from the filename.

### 3.3 Request pipeline

```
Request
  ▼
ThrottlerGuard              global limit, tightened per route by @Throttle()
  ▼
ValidationPipe              whitelist · forbidNonWhitelisted · transform
  ▼
Controller ──▶ Service ──▶ Repository ──▶ PostgreSQL
  ▼
TransformResponseInterceptor    wraps payload in the standard envelope
  ▼
HttpExceptionFilter             catch-all; same envelope shape on failure
  ▼
Response
```

Guards run before pipes, so a throttled request is rejected before validation — meaning a malformed request that is also over the limit returns 429, not 400.

### 3.4 Module topology

```
AppModule
├── ConfigModule            @Global · validated at boot
├── ThrottlerModule         global APP_GUARD
├── DatabaseModule          TypeORM connection
├── CommonModule            @Global · ReferenceNumberService, SpamCheckService
├── MailModule              @Global · MailService
├── MasterDataModule        @Global · all lookup tables
├── ContactModule           enquiries
└── CareersModule           job listings
```

`@Global` is used for genuinely cross-cutting providers only. Feature modules import nothing from each other; anything shared moves into `common`, `mail` or `master-data`.

---

## 4. Prerequisites

| Requirement | Minimum | Notes |
|---|---|---|
| Node.js | 20 LTS | Developed on 24.13.0 |
| npm | 10 | |
| PostgreSQL | 13 | Migration uses `gen_random_uuid()`, core from PG 13. Supabase runs 17.6. |

No local PostgreSQL installation is required when using Supabase — the application connects over the network via the `pg` driver.

---

## 5. Local setup

```bash
npm install
cp config/example.env config/dev.env      # then fill in real values
npm run migration:run
npm run start:dev
```

| Endpoint | URL |
|---|---|
| API root | http://localhost:3000 |
| Swagger UI | http://localhost:3000/api/docs |
| OpenAPI JSON | http://localhost:3000/api/docs-json |

There is **no global route prefix**. Endpoints sit at the root: `/contact/enquiries`, `/careers/jobs`.

A Postman collection covering all 24 endpoints ships at `docs/veltrixair.postman_collection.json`.

### 5.1 npm scripts

| Command | Purpose |
|---|---|
| `npm run start:dev` | Watch mode |
| `npm run start:prod` | Run compiled output from `dist/` |
| `npm run build` | Compile |
| `npm run lint` | ESLint with `--fix` |
| `npm test` | Unit tests |
| `npm run test:cov` | Coverage |
| `npm run migration:run` | Apply pending migrations |
| `npm run migration:revert` | Roll back the most recent migration |
| `npm run migration:show` | List applied and pending |
| `npm run migration:generate -- src/migrations/Name` | Diff entities against the live schema |

---

## 6. Configuration

### 6.1 Mechanism

Configuration lives in `config/`, selected by `NODE_ENV`:

- `NODE_ENV=production` → `config/prod.env`
- anything else → `config/dev.env`

Both are gitignored. **`config/example.env` is the only committed copy** and serves as the template.

Every variable is validated at boot by `src/config/env.validation.ts` using `class-validator`. A missing or malformed value **terminates the process at startup** rather than surfacing later as a misleading runtime error. This is deliberate: a container that refuses to start is caught by the deploy health check; one that starts misconfigured becomes a production incident.

### 6.2 Reference

| Variable | Required | Description |
|---|---|---|
| `NODE_ENV` | Yes | `development` \| `production` \| `test` |
| `PORT` | Yes | HTTP port, default 3000 |
| `DB_HOST` | Yes | Database host |
| `DB_PORT` | Yes | Database port — use 5432 |
| `DB_USERNAME` | Yes | Database user |
| `DB_PASSWORD` | Yes | Database password |
| `DB_NAME` | Yes | Database name. On Supabase this is literally `postgres` |
| `DB_SSL` | No | Auto-enabled for `*.rds.amazonaws.com`; set `true` for Supabase |
| `CORS_ORIGINS` | Yes | Comma-separated allowlist of browser origins |
| `THROTTLE_TTL` | No | Rate-limit window in ms, default 60000 |
| `THROTTLE_LIMIT` | No | Requests per window per IP, default 100 |
| `PRIVACY_NOTICE_VERSION` | Yes | Recorded verbatim against every consent |
| `IP_PEPPER` | Yes | **Minimum 32 characters.** HMAC key for hashing submitter IPs |
| `MAIL_FROM` | Yes | Sender address |
| `TURNSTILE_SECRET` | No | When unset, captcha verification is skipped |

### 6.3 `IP_PEPPER` — operational note

IPv4 has roughly four billion values, so an attacker holding the database but not the pepper cannot reverse the stored hashes; an attacker who can guess the pepper can enumerate every address instantly. The pepper is therefore the only control making those hashes irreversible.

Generate a distinct value per environment:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Never rotate it once live.** Changing the pepper makes every previously stored `ip_hash` unmatchable. Treat it as un-rotatable key material and back it up accordingly.

### 6.4 Supabase connectivity

Use the **direct connection on port 5432**, not the transaction pooler on 6543. The transaction pooler does not preserve session state, which breaks DDL and rejects the `-c timezone=UTC` startup option this application sends. If a pooler is required, use the session pooler and note that the username becomes `postgres.<project-ref>`.

---

## 7. Project structure

```
config/                       Environment files by NODE_ENV
docs/                         Postman collection, this document
src/
  main.ts                     Bootstrap: pipes, interceptor, filter, CORS, Swagger
  app.module.ts               Root module
  data-source.ts              TypeORM CLI entrypoint
  config/
    env.validation.ts         Boot-time environment schema
  database/
    database.config.ts        Shared connection options
    database.module.ts        TypeOrmModule.forRootAsync
  migrations/                 Hand-written, timestamp-ordered
  common/                     @Global — cross-cutting
    decorators/               @ResponseMessage
    dto/                      PaginationQueryDto, PaginatedResult
    filters/                  HttpExceptionFilter
    interceptors/             TransformResponseInterceptor
    services/                 ReferenceNumberService, SpamCheckService
    utils/                    business-hours.util (+ spec)
  mail/                       @Global — MailService
  master-data/                @Global — lookup tables
    entities/                 7 master entities
    master-data.service.ts
  contact/                    Enquiries
  careers/                    Job listings
```

### 7.1 Feature module layout

```
src/contact/
  contact.module.ts
  contact.service.ts                Single service, both surfaces
  enquiry-routing.service.ts        Module-specific provider at module root
  public-contact.controller.ts      Anonymous
  admin-contact.controller.ts       Staff
  dto/
  entities/
```

`entities/` holds `@Entity()` classes only; providers sit at the module root. A `services/` subfolder is introduced only when a module has three or more providers.

---

## 8. Data model

Twelve tables, excluding TypeORM's `migrations` bookkeeping table.

### 8.1 Master tables

| Table | Rows | Purpose |
|---|---|---|
| `office_masters` | 3 | Riyadh, Dubai, Bangalore — **timezone and working days** |
| `country_masters` | 11 | Contact form jurisdictions; maps country → owning office |
| `industry_masters` | 9 | Industry dropdown |
| `enquiry_topic_masters` | 7 | Enquiry topic; maps topic → destination inbox |
| `enquiry_timeline_masters` | 5 | Project timeline dropdown |
| `practice_area_masters` | 8 | Careers practice filter |
| `job_location_masters` | 3 | Careers location filter — **cities only** |

Masters use an **integer code as the natural key**; foreign keys reference the code column rather than the UUID primary key. Codes begin at **101** in every table and increment independently. Both conventions are inherited from the organisation's existing backend.

`office_masters` is not presentation data. It carries `timezone`, `working_days`, `work_start_hour` and `work_end_hour`, and is the input to every SLA calculation in the system.

### 8.2 Contact module

**`contact_enquiries`** — one row per submission.

| Group | Columns |
|---|---|
| Identity | `reference_no` (unique, `VLX-YYYY-NNNNNN`) |
| Form fields | `topic_code`, `full_name`, `company`, `role_title`, `work_email`, `phone`, `country_code`, `industry_code`, `timeline_code`, `message`, `requires_nda` |
| Consent | `consent_at`, `privacy_notice_version` |
| Routing / SLA | `office_code`, `routed_to_email`, `sla_due_at`, `first_responded_at`, `status`, `assigned_to` |
| Provenance | `source_page`, `utm_source`, `utm_medium`, `utm_campaign`, `ip_hash`, `user_agent`, `spam_score` |
| Housekeeping | `is_deleted`, `deleted_at`, `created_date`, `updated_date` |

`status` is constrained to `NEW · QUALIFYING · ENGAGED · WON · LOST · SPAM`.

**`contact_enquiry_events`** — append-only timeline. Event types: `CREATED`, `STATUS_CHANGED`, `ASSIGNED`, `NOTE_ADDED`, `MESSAGE_VIEWED`, `NOTIFICATION_SENT`. `MESSAGE_VIEWED` exists specifically to record reads of NDA-flagged enquiries.

**`contact_enquiry_ref_seq`** — PostgreSQL sequence backing reference numbers. A sequence rather than `COUNT(*) + 1`, which races under concurrent submissions and produces duplicates.

### 8.3 Careers module

**`job_postings`** — one row per role, seeded with the 14 currently listed (`R-001`–`R-014`). Carries `ref_code`, `slug`, classification (`practice_code`, `office_code`, `work_mode`), terms (`employment_type`, `experience_label`, `experience_min_years`, `experience_max_years`, `visa_sponsorship`), presentation (`hot_role`, `display_order`, SEO fields) and lifecycle (`status`, `posted_at`, `closes_at`).

**`job_posting_locations`** — join table. A role may span several locations ("Dubai / Riyadh", "Bangalore / Remote"), so location filtering uses an `EXISTS` subquery rather than a filtered join, ensuring a single-location filter does not truncate the location list returned per row.

### 8.4 Indexing

Beyond primary and unique keys:

- Foreign-key columns on `contact_enquiries` and `job_postings`
- `contact_enquiries (created_date DESC)` — default admin ordering
- Partial index `contact_enquiries (sla_due_at) WHERE first_responded_at IS NULL AND is_deleted = false` — drives the overdue filter
- Partial index `job_postings (hot_role DESC, display_order ASC) WHERE status = 'OPEN' AND is_deleted = false` — drives the default public listing

---

## 9. Cross-cutting behaviour

### 9.1 Response envelope

Every response, success or failure, uses one shape:

```jsonc
{
  "success": true,
  "statusCode": 201,
  "message": "Enquiry received",
  "data": { },
  "timestamp": "2026-08-04T10:15:43.696Z",
  "path": "/contact/enquiries",
  "method": "POST"
}
```

`message` is set per handler with `@ResponseMessage('…')`. Paginated endpoints return `{ items, total, page, limit, totalPages }` in `data`.

Errors use the same envelope with `success: false`. Validation failures place the field errors in `data` with `message: "Validation failed"`. Any other structured detail a thrower attaches is preserved in `data` too — a blackout that clashes with a confirmed session returns the clashing bookings in `data.conflicts`, so the caller can act on it rather than only knowing that something failed.

### 9.2 Personal-data containment

Columns holding personal data are declared `select: false`:

| Table | Columns |
|---|---|
| `contact_enquiries` | `message`, `phone`, `ip_hash` |

TypeORM excludes these unless explicitly requested with `addSelect()`. This inverts the default from *leak unless the developer is careful* to *safe unless deliberately requested* — the closest available approximation to compile-time protection, given TypeORM does not narrow types on `select`.

The admin list endpoint additionally uses an explicit column projection. Both controls are verified by end-to-end assertions.

### 9.3 Business-day arithmetic

`src/common/utils/business-hours.util.ts` computes SLA due dates against an office's working calendar.

| Office | Working week | Offset |
|---|---|---|
| Riyadh | Sunday–Thursday | UTC+3 |
| Dubai | Monday–Friday | UTC+4 |
| Bangalore | Monday–Friday | UTC+5:30 |

An enquiry arriving Thursday 17:00 in Riyadh is due **Sunday**; the same instant in Dubai is due **Friday**. Implemented with `Intl.DateTimeFormat` — no date library — and covered by 15 unit tests including the half-hour India offset and a ten-business-day span.

### 9.4 Abuse resistance

Applied to public write endpoints:

| Control | Weight | Decisive alone |
|---|---|---|
| Honeypot field filled | 100 | Yes |
| Turnstile verification failed | 100 | Yes |
| Disposable email domain | 60 | Yes |
| No MX record for domain | 30 | No |

Threshold is 50. `no_mx_record` is deliberately weighted below it: DNS resolution fails on transient resolver problems as well as genuinely mail-less domains, and a false positive must never lose a legitimate enquiry.

Submissions scoring at or above the threshold are **stored with `status: SPAM`, never rejected**. The caller receives an ordinary success response — telling a bot it was detected lets it tune around the filter, and a mistakenly flagged prospect must not see a failure. A false positive is recovered by changing status, at which point the SLA clock starts normally.

Rate limits: 100 requests/minute/IP globally; 5 requests/hour/IP on `POST /contact/enquiries`.

> **Limitation.** Throttler state is in-process. Running more than one instance multiplies the effective limit; shared storage (Redis) is required before horizontal scaling.

### 9.5 Confidential enquiries

The contact form offers *"This enquiry includes confidential information. Please send a mutual NDA before we go further."* When set:

- The message body is **omitted** from notification email; the notice links to the admin record instead
- Any admin read of the full record writes a `MESSAGE_VIEWED` event naming the actor

---

## 10. API reference

### 10.1 Public

| Method | Route | Description |
|---|---|---|
| `GET` | `/contact/form-options` | All four contact dropdowns in one response |
| `POST` | `/contact/enquiries` | Submit an enquiry — 5/hour/IP |
| `GET` | `/careers/filters` | Practice, location (cities) and work-mode filter chips |
| `GET` | `/careers/jobs` | List open roles — `practice`, `location`, `workMode`, `search`, `hotOnly`, `sort`, `page`, `limit` |
| `GET` | `/careers/jobs/:slug` | Role detail |
| `GET` | `/insights/filters` | Type (with badge colours), topic and region chips |
| `GET` | `/insights/articles` | Card grid — `type`, `topic`, `region`, `search`, `sort`, `page`, `limit` |
| `GET` | `/discovery/practices` | Six practices with their architects |
| `GET` | `/discovery/availability` | Per-day density — requires `timezone` |
| `GET` | `/discovery/slots` | Bookable times for one **visitor-local** date |
| `POST` | `/discovery/bookings` | **5/hour/IP** — atomic slot claim, 409 if taken |
| `GET` | `/discovery/bookings/:token` · `POST /:token/cancel` | Attendee self-service |

**Discovery admin** — architects and their calendars:

| Method | Route | Notes |
|---|---|---|
| `GET` `POST` | `/admin/discovery/architects` · `/:id` | |
| `PATCH` | `/admin/discovery/architects/:id` | Name, credentials, practice, office |
| `PATCH` | `/admin/discovery/architects/:id/practice` | Reassign — the calendar follows the architect |
| `DELETE` | `/admin/discovery/architects/:id` | 409 while upcoming sessions exist |
| `GET` `PUT` | `/admin/discovery/architects/:id/availability` | Weekly pattern; a day off is an absent weekday |
| `GET` `POST` | `/admin/discovery/blackouts` | 409 if the period covers a confirmed session |
| `DELETE` | `/admin/discovery/blackouts/:id` | Reopens the slots it closed |

### 10.2 Admin

> **These routes are not authenticated in this release.** See §15.

| Method | Route | Description |
|---|---|---|
| `GET` | `/admin/contact/enquiries` | Filter by `status`, `topicCode`, `officeCode`, `search`, `overdue` |
| `GET` | `/admin/contact/enquiries/:id` | Full record including message body |
| `GET` | `/admin/contact/enquiries/:id/events` | Timeline |
| `PATCH` | `/admin/contact/enquiries/:id/status` | First move into a working status stops the SLA clock |
| `PATCH` | `/admin/contact/enquiries/:id/assign` | |
| `POST` | `/admin/contact/enquiries/:id/notes` | |
| `GET` | `/admin/careers/jobs` | Includes drafts and closed roles |
| `GET` | `/admin/careers/jobs/:id` | |
| `POST` | `/admin/careers/jobs` | |
| `PATCH` | `/admin/careers/jobs/:id` | |
| `PATCH` | `/admin/careers/jobs/:id/status` | `DRAFT` \| `OPEN` \| `CLOSED` |
| `DELETE` | `/admin/careers/jobs/:id` | Soft delete |
| `GET` | `/admin/insights/articles` · `/:id` | Includes drafts and archived |
| `POST` | `/admin/insights/articles` | |
| `PATCH` | `/admin/insights/articles/:id` · `/status` | |
| `DELETE` | `/admin/insights/articles/:id` | Soft delete |

---

## 11. Database and migrations

`synchronize` is **disabled in every environment**. Schema changes occur only through migrations, applied as a discrete pre-deploy step — never on application boot.

### 11.1 Applied migrations

| Timestamp | Name | Creates |
|---|---|---|
| `1785801600000` | `CreateContactModule` | 5 masters, `contact_enquiries`, `contact_enquiry_events`, reference sequence |
| `1785805200000` | `CreateCareersModule` | 2 masters, `job_postings`, `job_posting_locations` |
| `1785808800000` | `RenumberMasterCodesFrom101` | Shifts every master code and its references by +100 |
| `1785812400000` | `SeparateRemoteFromLocations` | Removes "Remote" from the location taxonomy; remote-ness moves to `work_mode` |
| `1785816000000` | `CreateInsightsModule` | 3 masters, `articles`, `article_regions`; seeds the 14 cards |
| `1785819600000` | `RemoveArticleFeaturedFlag` | Drops `featured` — hero selection is a frontend concern |
| `1785823200000` | `CreateDiscoveryModule` | Practices, architects, availability rules, blackouts, slots, bookings |

### 11.2 Standards

**Migrations are hand-written.** `migration:generate` diffs decorators against a live database and produces noisy — occasionally destructive — SQL. Anything touching personal-data columns is authored deliberately.

**An applied migration is immutable.** TypeORM tracks migrations by timestamp, so editing a file changes nothing on a database that has already run it; the result is silent divergence between environments. Corrections are issued as new migrations.

**Verification.** Run `migration:generate` twice in succession; the second run must produce an empty migration. If it does not, the entities and the database genuinely disagree.

**Seeds.** Prefer separate schema and seed migrations for new work, following the existing organisational convention.

---

## 12. Conventions

### 12.1 Inherited

Aligned with the organisation's existing backend so both codebases read the same way:

- Tables named `snake_case_plural`; columns explicitly mapped with `@Column({ name: '…' })`
- Constraints named `vtx_<table>_<column>_pk|fk|unique`; indexes `idx_<table>_<column>`
- Master tables keyed on an integer code starting at 101; foreign keys reference the code column
- Housekeeping columns `is_active`, `is_deleted`, `deleted_at`, `created_date`, `updated_date`
- A single `buildBaseOptions()` feeding both the Nest module and the CLI `DataSource`
- Standard response envelope and `@ResponseMessage()` decorator
- Environment files in `config/`, selected by `NODE_ENV`

### 12.2 Deliberate deviations

| Aspect | Existing backend | This service | Rationale |
|---|---|---|---|
| Timestamps | `timestamp`, session TZ `Asia/Kolkata` | `timestamptz`, session TZ **UTC** | Three offices on three offsets; no single local timezone is correct for all |
| CORS | `origin: true` (reflects any origin) | Explicit allowlist | Public site with credentialed requests; reflecting any origin defeats the protection |
| Environment | Trusted, silent fallbacks | Validated at boot | Multiple environments drift silently |
| Rate limiting | None | Global plus per-route | Anonymous public write endpoints |
| Enumerations | Postgres `ENUM` types | `varchar` + `as const` union + `CHECK` | TypeORM enum-change migrations are unreliable; adding a value becomes a one-line constraint change |

Each deviation reflects a difference in traffic profile: the existing backend is an internal, single-country, fully authenticated system. This one is public, multi-region and largely anonymous.

---

## 13. Testing

```bash
npm test            # unit
npm run test:cov    # coverage
```

**Unit tests — 15, all passing.** Concentrated on `business-hours.util`: the SLA arithmetic is the component most likely to be subtly wrong, is pure, and is therefore cheap to test exhaustively. Coverage includes each office's working week, the half-hour India offset, weekend roll-over in both calendars, and multi-day spans.

**End-to-end verification.** Both modules were exercised against the live database:

| Module | Assertions | Covers |
|---|---|---|
| Contact | 26 | Form options, consent enforcement, reference format, per-office SLA divergence, topic and country routing, honeypot handling, throttle, PII containment, NDA audit, status transitions |
| Careers | 24 | Filter options, all filter dimensions, combined filters, keyword search, multi-location integrity, slug detail, 404 handling, pagination, admin visibility |

> `package.json` points `test:e2e` at `./test/jest-e2e.json`, which does not yet exist — specs are colocated under `src/`. Harmless until that script is run.

---

## 14. Build and deployment

### 14.1 Build

```bash
npm ci
npm run build          # emits dist/
npm run migration:run  # discrete pre-deploy step
npm run start:prod
```

### 14.2 Production readiness

Required before this service handles production traffic:

| Item | Status |
|---|---|
| Admin authentication | **Blocking** — see §15 |
| Real mail transport | Required for notifications to be delivered |
| `TURNSTILE_SECRET` configured | Recommended; honeypot and MX checks operate without it |
| Distinct `IP_PEPPER` per environment | Required |
| `CORS_ORIGINS` set to production origins | Required |
| Shared throttler storage (Redis) | Required before running more than one instance |
| Structured logging and error reporting | Not yet configured |
| Health and readiness endpoints | Not yet implemented |
| Container image and CI pipeline | Not yet created |

### 14.3 Operational notes

- Sequences do not roll back. Deleting test enquiries leaves gaps in reference numbering; this is cosmetic.
- TypeORM issues `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"` on connect. Harmless on Supabase, but the production role's privileges are worth reviewing.
- The application logs SQL when `NODE_ENV=development`. Query parameters contain personal data and must not be logged in production; the current configuration already restricts production logging to errors and warnings.

---

## 15. Known gaps

| Gap | Severity | Detail |
|---|---|---|
| **Admin routes unauthenticated** | **Blocking** | `/admin/**` exposes lead personal data without authentication. Guard insertion points are marked at class level in both admin controllers, and `actor` is already threaded through every mutating call so the audit trail is correct as soon as real authentication is introduced. **Must not be deployed in this state.** |
| Mail transport stubbed | High | `MailService.dispatch()` logs rather than sends. Replacing it requires no caller changes. |
| Turnstile inactive | Medium | Skipped unless `TURNSTILE_SECRET` is set. |
| Careers Scope B | Planned | Applications, résumé upload, virus scanning, hiring pipeline. Requires an object-storage decision. |
| Async job processing | Planned | Email dispatch is inline after commit. |
| Remaining site modules | Planned | Insights, newsletter, gated downloads, client portal. |

### 15.1 Open question

The careers page states two different response commitments — *"within five business days"* for listed roles and *"within ten business days"* for senior applications. This should be resolved with the content owner before Careers Scope B, as it determines the SLA constant.

---

## Appendix A — Reference codes

Master codes begin at **101** in every table and increment independently, matching the convention used by the organisation's existing backend.

**Enquiry topics** → destination inbox

| Code | Topic | Inbox |
|---|---|---|
| 101 | New Engagement | `contact@` |
| 102 | RFP / RFI | `contact@` |
| 103 | Partnership | `contact@` |
| 104 | Voice AI Demo | `voiceai@` |
| 105 | Privacy Advisory | `privacy@` |
| 106 | Managed Services | `contact@` |
| 107 | Other | `contact@` |

**Countries** → owning office

| Code | Country | Office |
|---|---|---|
| 101 | Saudi Arabia (KSA) | Riyadh |
| 102 | United Arab Emirates | Dubai |
| 103–106 | Bahrain, Qatar, Kuwait, Oman | Riyadh |
| 107 | India | Bangalore |
| 108–111 | United Kingdom, European Union, United States, Other | Riyadh |

**Industries** — 101 Banking & Finance · 102 Government & Public Sector · 103 Energy & Utilities · 104 Healthcare & Life Sciences · 105 Real Estate & Hospitality · 106 Retail & E-Commerce · 107 Manufacturing & Logistics · 108 Education & EdTech · 109 Other

**Timelines** — 101 Immediate (this quarter) · 102 Next 1–3 months · 103 3–6 months · 104 6–12 months · 105 Exploratory / Researching

**Practice areas** — 101 Software · 102 Platform · 103 Cyber · 104 Privacy · 105 Managed · 106 Business Apps · 107 Growth · 108 Ops

**Article types** — 101 Insight · 102 Case Study · 103 Whitepaper · 104 Regulatory Update · 105 Perspective (each carries a badge colour)

**Article topics** — 101 Software · 102 Platform · 103 Cybersecurity · 104 Data Privacy · 105 AI & ML · 106 Business Apps · 107 Growth

**Regions** — 101 KSA · 102 GCC · 103 India · 104 Global (editorial regions, distinct from `country_masters`)

**Job locations** — 101 Riyadh · 102 Dubai · 103 Bangalore

Cities only. "Remote" is a working arrangement, not a place, and lives on `job_postings.work_mode`.

**Work modes** — `ONSITE` · `HYBRID` · `REMOTE` (a `CHECK`-constrained column, not a master table)

**Offices**

| Code | Office | Timezone | Working week |
|---|---|---|---|
| 101 | Riyadh HQ | Asia/Riyadh | Sunday–Thursday |
| 102 | Dubai Regional Office | Asia/Dubai | Monday–Friday |
| 103 | Bangalore Delivery Centre | Asia/Kolkata | Monday–Friday |
