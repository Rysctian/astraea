# Architecture

Data flows strictly from schema to UI without duplicating types:

1. `packages/db` owns PostgreSQL tables (`src/schema/*.ts`), Drizzle migrations (`drizzle/`), and the `postgres` client (`createDb`).
2. `packages/shared` derives Zod schemas (`drizzle-orm/zod`) and TypeScript DTO types from `@starter/db/schema` (browser-safe subpath).
3. `apps/api` (NestJS 12 + Fastify 5) injects the Drizzle client via `DatabaseModule`, validates HTTP inputs with `@starter/shared` via `StandardSchemaValidationPipe`, logs with `nestjs-pino`, and serves OpenAPI at `/docs`.
4. `apps/web` (React 19 + Vite 8) proxies `/api` to the API in dev, validates forms with `@starter/shared`, and manages server state with TanStack Query.
5. Turborepo builds `packages/db` -> `packages/shared` -> `apps/{api,web}` and caches `typecheck`, `test`, and `build`.
