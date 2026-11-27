# packages/db — Agent Rules

- Drizzle ORM/Kit v1 (`1.0.0-rc.6`) with `postgres` driver. Load `.agents/skills/drizzle/SKILL.md` for Drizzle CLI/migration details.
- In Drizzle v1, initialize via `drizzle({ client })` (do not pass `schema` to `drizzle()`).
- Export browser-safe table definitions from `@starter/db/schema` (`src/schema/index.ts`); keep `postgres` client code isolated in `src/client.ts`.
- Never hand-edit applied SQL files in `drizzle/`; always change `src/schema/*.ts` and run `pnpm db:generate`.
