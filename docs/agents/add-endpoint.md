# Recipe: Add an API Endpoint

1. Add or update the Zod input/param schemas in `packages/shared/src/schemas/` and export them from `packages/shared/src/index.ts`.
2. Add unit tests for the new schema in `packages/shared/src/schemas/*.test.ts`.
3. Create or extend a Nest module under `apps/api/src/<feature>/` (`<feature>.service.ts`, `<feature>.controller.ts`, `<feature>.module.ts`) and register it in `AppModule`.
4. Inject `DB` (`@Inject(DB)`) in the service and map Postgres constraint errors (e.g. `23505`) to Nest `HttpException`s.
5. Attach `@Body({ schema })` / `@Param({ schema })` and `@ApiOperation` / `@ApiTags` decorators on the controller.
6. Add a Fastify `app.inject()` test in `<feature>.controller.test.ts` and a Testcontainers case in `*.integration.test.ts`.
7. Run `pnpm check`.
