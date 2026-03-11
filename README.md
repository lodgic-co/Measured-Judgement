# measured-judgement

Identity and permission authority service for the platform. Resolves external identities to internal user UUIDs, evaluates organisation and property-scoped permissions, manages memberships and roles, and serves as the routing directory for organisation-to-authority-instance assignments.

This is the authoritative service for identity resolution and permission evaluation in the suite. No other service may implement or duplicate these concerns.

## Primary responsibilities

- Resolve external identity (`provider` + `external_subject`) to `actor_user_uuid`
- Evaluate organisation-scoped permissions for authenticated actors
- Evaluate property-scoped permissions for authenticated actors
- Assert organisation membership
- Serve routing assignments: `organisation_uuid → authority_instance_id + base_url`
- Manage the permission catalogue (immutable, append-only)
- Own the authority cluster tables: users, user_identities, user_organisations, roles, role_permissions, role_assignments, role_assignment_properties

## Non-responsibilities

- Does not serve public traffic
- Does not authenticate end users directly (that is the edge's responsibility)
- Does not issue Auth0 tokens
- Does not own organisation domain data (organisations, properties, rate plans) — that is `considered-response`
- Does not own property domain data
- Does not implement business domain logic for organisations, properties, or commercial entities
- Does not cache permission outcomes for other services

## Architecture placement

```
Browser (surface-detail)
  │
  ▼
polite-intervention  (public edge)
  │           │
  │           ▼
  │     measured-judgement  ← this service
  │     ↑   (identity, permissions, routing directory)
  ▼     │
considered-response  (domain data service — calls MJ for permission evaluation)
```

**Upstream callers:** `polite-intervention` (gateway) and `considered-response` (domain data service — calls this service for permission evaluation). Only allowlisted internal services may call this service. Future internal services requiring permission checks must also call this service.

**Downstream dependencies:** PostgreSQL database (schema: `measured_judgement`)

## Network boundary

- **Internal only** — must not be publicly reachable from the internet
- Only reachable from `polite-intervention` and explicitly allowlisted internal services
- Must not accept direct traffic from browsers, mobile apps, or public networks

## Authentication and authorisation

### Auth0 M2M Token (Primary — Always Required)

All non-health endpoints require `Authorization: Bearer <jwt>` validated via JWKS (RS256 only, 60-second clock tolerance).

Validation checks:
- Signature via Auth0 JWKS endpoint (`AUTH0_JWKS_URI`)
- Issuer (`AUTH0_ISSUER`)
- Audience (`AUTH0_AUDIENCE`)
- Authorised party (`AUTH0_ALLOWED_AZP`) — comma-separated allowlist of permitted caller `azp` claims. Accepts multiple callers (e.g. `polite-intervention` and `considered-response` client IDs)

`caller_service_id` is derived from the token `azp` claim.

### Internal Service Secret (Dev / Slice Only — Temporary)

In development and test environments, an additional `X-Internal-Secret` header check runs before JWT validation when `INTERNAL_SERVICE_SECRET` is set. This is a temporary safeguard for environments without network boundary isolation.

- Enforced only in development/test
- Runs before (not instead of) JWT validation
- Ignored in production/staging
- Must not exist in staging or production environments

### Delegated Actor Context

This service accepts delegated actor headers forwarded by `polite-intervention`:

- `X-Actor-Type` — `user`, `service`, `system`, or `anonymous`
- `X-Actor-User-Uuid` — required when type is `user`
- `X-Organisation-Uuid` — required for organisation-scoped permission checks
- `X-Request-Id` — propagated for request correlation

### Health Endpoints

`GET /health/live` and `GET /health/ready` are explicitly public — no authentication required.

## API surface

**OpenAPI specification**: [`openapi/openapi.yaml`](openapi/openapi.yaml)

### Endpoints

| Method | Path | Auth | Actor | Description |
|--------|------|------|-------|-------------|
| `GET` | `/health/live` | None | — | Liveness probe |
| `GET` | `/health/ready` | None | — | Readiness probe (checks DB connectivity) |
| `GET` | `/internal/ping` | Token | — | Auth validation proof |
| `GET` | `/identity/resolve` | Token | — | Resolve `provider` + `external_subject` → `actor_user_uuid` |
| `POST` | `/organisations/:uuid/permissions/check` | Token | User | Check property-scoped permission coverage |
| `GET` | `/routing/organisations/:uuid` | Token | — | Resolve `organisation_uuid` → `authority_instance_id` + `base_url` |

### Identity resolution

`GET /identity/resolve?provider=<provider>&external_subject=<sub>`

Returns `{ actor_user_uuid, authority_instance_id, base_url }` — the resolved user identity and the routing target for that user's authority instance, in one call.

**Failure behaviour:** Unknown `provider + external_subject` returns `404 not_found`. polite-intervention maps this to `401 unauthenticated` (not exposed to clients).

### Permission checks

`POST /organisations/:uuid/permissions/check`

Body: `{ permission_key, property_uuids? }`

Evaluates organisation membership, permission catalogue membership, and optionally property-scoped assignment coverage. Returns `{ allowed, reason? }`.

**Non-leakage:** Returns `404 not_found` when the organisation does not exist, the actor is not a member, or permission is denied. These cases are indistinguishable externally.

### Routing directory

`GET /routing/organisations/:uuid`

Returns `{ authority_instance_id, base_url }` for the given `organisation_uuid`. polite-intervention calls this before every organisation-scoped downstream call.

**Failure behaviour:** Unknown organisation returns `404`. polite-intervention maps this to `502 bad_gateway`.

### Permission Key Catalogue

Organisation scoped:
- `organisation.view`
- `organisation.users.manage`
- `organisation.properties.read`

Property scoped:
- `property.configure`
- `reservations.view`, `reservations.create`, `reservations.modify`, `reservations.cancel`
- `rate_plans.view`, `rate_plans.values.modify`, `rate_plans.structure.modify`
- `financial.folios.view`, `financial.charges.post`, `financial.payments.post`

Permission keys are immutable and append-only. Keys must never be renamed or change scope once released.

## Environment variables

All variables are validated at boot. Missing or malformed values cause immediate process exit.

### Required at boot

| Variable | Description |
|----------|-------------|
| `AUTH0_DOMAIN` | Auth0 tenant domain |
| `AUTH0_AUDIENCE` | Auth0 API audience identifier |
| `AUTH0_ALLOWED_AZP` | Comma-separated allowlist of permitted caller `azp` claims. Accepts multiple backend callers (currently `polite-intervention` and `considered-response`). |
| `AUTH0_ISSUER` | Auth0 issuer URL |
| `AUTH0_JWKS_URI` | Auth0 JWKS endpoint |
| `DATABASE_URL` | Pooled Postgres connection string (runtime queries) |
| `DB_SCHEMA` | Database schema name (`measured_judgement`) |
| `DB_POOL_SIZE` | Maximum connections in the pg Pool |
| `DB_CONNECTION_TIMEOUT_MS` | Connection timeout in milliseconds |
| `DB_IDLE_TIMEOUT_MS` | Idle timeout in milliseconds |
| `CURSOR_HMAC_SECRET` | HMAC secret for pagination cursor signing (must not be logged or shared across services) |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5100` | Server listen port |
| `LOG_LEVEL` | `info` | Pino log level |
| `NODE_ENV` | `development` | Environment (`development`, `production`, `test`) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `""` (disabled) | OpenTelemetry OTLP collector endpoint |
| `OTEL_SERVICE_NAME` | `measured-judgement` | OpenTelemetry service name |

### Dev / Slice Only (Temporary)

| Variable | Description |
|----------|-------------|
| `INTERNAL_SERVICE_SECRET` | Temporary shared secret for `X-Internal-Secret` header. Enforced only in `development`/`test`. Must not exist in production. |

### Migration Only

| Variable | Description |
|----------|-------------|
| `DATABASE_URL_DIRECT` | Non-pooled Postgres connection string for migrations and seeds. Not validated at app boot. |

## Database

### Schema

- **Provider**: PostgreSQL (Neon serverless Postgres)
- **Schema**: `measured_judgement` — all application tables live in this schema
- **Connection**: SSL required
- **Migration tracking table**: `public.pgmigrations_measured_judgement`

### Core Tables

`users`, `user_identities`, `user_organisations`, `roles`, `role_permissions`, `role_assignments`, `role_assignment_properties`, `authority_instances`, `organisation_assignments`

All mutable tables have `updated_at` triggers.

### Migration Commands

| Command | Purpose |
|---------|---------|
| `pnpm db:migrate` | Run pending migrations |
| `pnpm db:rollback` | Roll back last migration |
| `pnpm db:seed:dev` | Run dev seed data (environment-gated, idempotent) |
| `pnpm db:create-migration` | Scaffold a new migration file |

## Health endpoints

### `GET /health/live`

Returns `200 { "status": "ok" }` if the process is running. No downstream checks.

### `GET /health/ready`

Returns `200 { "status": "ready" }` when the server has started and database connectivity is verified. Returns `503 { "status": "not_ready" }` if the database is unreachable.

Readiness checks:
1. Server has completed startup
2. Database pool is available
3. Lightweight query (`SELECT 1`) succeeds within a 1-second timeout

## Observability

### OpenTelemetry

Traces, metrics, and logs exported via OTLP when `OTEL_EXPORTER_OTLP_ENDPOINT` is set.

Exactly one structured completion log per request. Includes: `request_id`, `method`, `path`, `status_code`, `duration_ms`, `caller_service_id`, `actor_user_uuid`, `organisation_uuid`, `error_code`.

### Structured Logging

- Structured JSON only (pino)
- No secrets, tokens, or raw Authorization headers logged
- `disableRequestLogging: true` on Fastify to prevent duplicate logs

## Local development

```bash
pnpm install
cp .env.example .env
pnpm db:migrate
pnpm db:seed:dev
pnpm dev
```

## CI

```bash
pnpm run ci
```

Runs: typecheck → lint → openapi:check → db:migrate → test → build

## Repository structure

```
src/
  auth/           # M2M token verification, delegated actor parsing
  config/         # Environment validation and boot config
  db/             # pg Pool setup
  domain/         # Business logic: procedures, permission catalogue
  errors/         # AppError type, error factories, envelope builder
  http/           # Fastify app setup, error handler, request ID
  observability/  # Pino logger config, OpenTelemetry setup
  routes/         # Route handlers (thin, compose procedures)
  index.ts        # Entry point
db/
  migrations/     # node-pg-migrate migration files (.cjs)
  migrations_dev/ # Dev seed migration files (.cjs)
tests/
  unit/           # Unit tests
  integration/    # Integration tests (against live DB)
openapi/
  openapi.yaml    # OpenAPI 3.0.3 specification
decision-procedures/
  generated/      # Generated decision procedure artifacts
```

## Security and operational invariants

- No in-memory persistence for business-critical data
- No silent fallback behaviour in auth
- Permission evaluation must default deny on any authorisation evaluation error
- Permission catalogue keys are immutable once released
- No forwarding of end-user tokens to internal services
- No permission caching exposed to external callers
- Internal database identifiers never exposed in any response
- All hot-path queries scoped by organisation_uuid or user_uuid
- Lockfile committed and respected
