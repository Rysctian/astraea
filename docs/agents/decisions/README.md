# Architecture Decision Records (ADRs)

Record significant technical decisions here as `NNNN-short-title.md` (Context, Decision, Consequences).

- **Drizzle v1 RC + `@starter/db/schema` subpath:** Schemas are exported separately from the `postgres` client so `apps/web` can consume `@starter/shared` without bundling Node database drivers.
- **NestJS 12 Standard Schema validation:** Uses native `StandardSchemaValidationPipe` with Zod 4 schemas directly, avoiding `nestjs-zod`.
- **Unit vs. integration test split:** `pnpm test` runs fast unit and Fastify `app.inject()` tests everywhere; `pnpm --filter @starter/api test:integration` runs Testcontainers PostgreSQL tests when Docker is available (and in CI).
