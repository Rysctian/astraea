# Recipe: Add a Database Migration

1. Define or update the table in `packages/db/src/schema/<table-name>.ts` using `drizzle-orm/pg-core`.
2. Re-export the table from `packages/db/src/schema/index.ts` and `packages/db/src/index.ts`.
3. Update or add a schema test in `packages/db/src/schema/*.test.ts`.
4. Generate the SQL migration: `pnpm db:generate`.
5. Review the generated SQL under `packages/db/drizzle/` before committing.
6. Apply it locally against Docker Postgres: `pnpm db:migrate`.
7. Run `pnpm check` to verify downstream `@starter/shared` and `apps/api` types and tests.
