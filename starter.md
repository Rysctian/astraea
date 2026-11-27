# Task: Scaffold a Production-Ready Monorepo Starter Kit

You are a coding agent. Build the monorepo below from scratch. Work in order, verify each phase, and keep everything minimal: no speculative abstractions, no unused boilerplate.

## Rules

- **Always use the latest stable version** of every dependency. Check the registry (`npm view <pkg> version`) instead of guessing. Pin via the lockfile.
- **Exception:** Drizzle v1 is still a release candidate. Install `drizzle-orm@rc` and `drizzle-kit@rc` together. If RC breaks, fall back to the last stable 0.x and tell me.
- Node: current Active LTS (must satisfy Vite 8: 20.19+ or 22.12+). ESM everywhere.
- TypeScript `strict: true` everywhere. ESM only.
- No hardcoded secrets. All config via validated env vars.
- Prefer 1-2 helper functions over many tiny abstractions.
- Every phase must pass `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` before moving on.

## Stack

| Layer | Choice |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| Frontend | React + Vite 8 + TypeScript (`@vitejs/plugin-react` v6) |
| Backend | NestJS 12 (ESM) + Fastify 5 adapter (`@nestjs/platform-fastify`). Stay on Fastify 5; v6 is alpha |
| ORM / DB | Drizzle ORM v1 (`@rc`) + drizzle-kit, PostgreSQL |
| Validation | Zod (shared schemas) + `drizzle-orm/zod`. Use Nest 12 Standard Schema in `@Body/@Query/@Param`; add `nestjs-zod` only if that doesn't work |
| Routing / data (web) | TanStack Router + TanStack Query |
| UI | Tailwind CSS + shadcn/ui |
| Testing | Vitest (web, packages, api), Testcontainers (api integration vs real Postgres), Playwright (e2e) |
| Quality | Biome (lint + format), knip (dead code/unused deps), Husky + lint-staged, commitlint |
| API docs | `@nestjs/swagger` (OpenAPI) |
| Logging | Pino (`nestjs-pino`) |
| Infra | Docker Compose (Postgres), GitHub Actions CI |

## Structure

```
.
├── apps/
│   ├── api/            # NestJS + Fastify (+ AGENTS.md)
│   └── web/            # React + Vite (+ AGENTS.md)
├── packages/
│   ├── db/             # Drizzle schema, migrations, client (+ AGENTS.md)
│   ├── shared/         # Zod schemas, DTO types, constants
│   └── tsconfig/       # Shared tsconfig bases
├── e2e/                # Playwright
├── docs/agents/        # architecture.md, add-endpoint.md, add-migration.md, add-page.md, decisions/
├── .github/workflows/ci.yml
├── docker-compose.yml
├── turbo.json
├── pnpm-workspace.yaml
├── AGENTS.md           # Single source of truth (Codex, Antigravity, Claude Code, Grok)
├── CLAUDE.md           # Optional. One line: @AGENTS.md (only for Claude-specific rules)
└── .env.example
```

## Phases

1. **Root**: pnpm workspace, Turborepo pipeline (`dev`, `build`, `lint`, `typecheck`, `test`) and a root `pnpm check` that runs lint + typecheck + test + build, shared tsconfig + Biome, knip, `.editorconfig`, `.gitignore`, `.nvmrc` (current LTS), `engines` field.
2. **`packages/db`**: Drizzle + `postgres` driver, example `users` table, `drizzle.config.ts`, scripts: `db:generate`, `db:migrate`, `db:studio`. Export typed client and schema. Run `drizzle-kit skills` to install Drizzle's bundled agent skills.
3. **`packages/shared`**: Zod schemas (e.g. `createUserSchema`) and inferred types, consumed by both apps. Prefer `drizzle-orm/zod` for DB-derived schemas.
4. **`apps/api`**: NestJS on Fastify. Modules: `config` (Zod-validated env), `database` (injects Drizzle client), `health` (`/health`), `users` (example CRUD, with one Testcontainers integration test). Global validation, exception filter, CORS, Helmet, Swagger at `/docs`, Pino logging, graceful shutdown.
5. **`apps/web`**: Vite + React + TS, Tailwind + shadcn/ui, TanStack Router/Query, typed API client, env via `import.meta.env` (validated), Vite proxy to API in dev. Example users page.
6. **Infra**: `docker-compose.yml` with Postgres (healthcheck + named volume), `.env.example`, CI workflow (install, lint, typecheck, test, build with pnpm + Turbo cache).
7. **Quality gates**: Husky pre-commit (lint-staged), commit-msg (commitlint, Conventional Commits), one passing unit test per app, one Playwright smoke test.
8. **Agent files**: use the provided `AGENTS.md` as the root file. Add short nested `AGENTS.md` files in `apps/api`, `apps/web`, `packages/db` (closest file wins). Write the four recipes in `docs/agents/` (about 15 lines each). `CLAUDE.md` is optional (`@AGENTS.md` only). Verify Grok reads `AGENTS.md`; if not, add a one-line pointer file.

## Agent files

Root `AGENTS.md` is provided separately: keep it under 100 lines, as an index. Update the structure and commands in it to match what you actually built. Never let it drift from reality.

## Done when

- `pnpm install && docker compose up -d && pnpm db:migrate && pnpm dev` runs web and api with no errors
- `pnpm check` passes
- `/health` returns 200, `/docs` loads, web shows the users example end-to-end
- CI passes on a clean clone
- README has a short quick-start (under 20 lines)
