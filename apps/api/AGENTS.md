# apps/api — Agent Rules

- NestJS 12 ESM + Fastify 5 (`@nestjs/platform-fastify`). Never import Express types.
- Use explicit `@Inject(TOKEN)` on constructor parameters so DI works under ESM / `tsx` / Vitest.
- Validate `@Body`, `@Param`, `@Query` with NestJS 12 Standard Schema options (`{ schema }`) using schemas from `@starter/shared`.
- Map Postgres errors (e.g. `23505` unique violation) to Nest `HttpException` subclasses in services; let `HttpExceptionFilter` format responses.
- Unit + Fastify `app.inject()` tests live in `*.test.ts` (`pnpm --filter @starter/api test`).
- Testcontainers PostgreSQL tests live in `*.integration.test.ts` (`pnpm --filter @starter/api test:integration`).
