# AGENTS.md

Single source of truth for AI coding agents working in this monorepo. Nearest `AGENTS.md` wins for package-specific rules.

## Stack

- **Monorepo:** pnpm workspaces + Turborepo, Node 24 LTS (`>=22.12`), ESM only, TypeScript `strict: true`
- **API (`apps/api`):** NestJS 12 + Fastify 5, Standard Schema validation (Zod 4), Swagger (`/docs`), Pino (`nestjs-pino`)
- **Web (`apps/web`):** React 19 + Vite 8, TanStack Router & Query, Tailwind CSS 4 + shadcn/ui
- **DB (`packages/db`):** Drizzle ORM/Kit v1 (`1.0.0-rc.6`) + `postgres` driver, PostgreSQL 17
- **Shared (`packages/shared`):** Zod schemas derived via `drizzle-orm/zod` (`@starter/db/schema`)
- **Quality:** Biome (lint + format), knip, Vitest, Testcontainers, Playwright, Husky + lint-staged, commitlint

## Structure

- `apps/api/` — NestJS + Fastify backend (see `apps/api/AGENTS.md`)
- `apps/web/` — React + Vite frontend (see `apps/web/AGENTS.md`)
- `packages/db/` — Drizzle schema, migrations, client (see `packages/db/AGENTS.md`)
- `packages/shared/` — Shared Zod schemas and DTO types
- `packages/tsconfig/` — Shared `base.json`, `node.json`, `react.json`
- `e2e/` — Playwright end-to-end smoke tests
- `docs/agents/` — Architecture overview, recipes, and ADRs

## Commands

```bash
pnpm install                                  # Install deps + Husky hooks
docker compose up -d                          # Start PostgreSQL 17
pnpm db:generate                              # Generate Drizzle SQL migration
pnpm db:migrate                               # Apply pending SQL migrations
pnpm dev                                      # Run API (:3001) + Web (:5173)
pnpm check                                    # Run lint + typecheck + test + build
pnpm test:integration                         # Run Testcontainers API tests (requires Docker)
pnpm test:e2e                                 # Run Playwright e2e tests
pnpm knip                                     # Check unused files, exports, and deps
```

## Rules

- Never hardcode secrets; validate all env vars with Zod.
- Keep abstractions minimal (1–2 helpers over many tiny wrappers).
- Run `pnpm check` before finishing any task.
- Use Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`).

## Recipes

- [Architecture](docs/agents/architecture.md)
- [Add an API endpoint](docs/agents/add-endpoint.md)
- [Add a DB migration](docs/agents/add-migration.md)
- [Add a web page](docs/agents/add-page.md)
- [Decisions (ADRs)](docs/agents/decisions/README.md)
