# Production-Ready Monorepo Starter Kit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold a minimal, production-ready, strict-TypeScript ESM monorepo starter kit from scratch with pnpm workspaces, Turborepo, Drizzle v1 + PostgreSQL, shared Zod schemas, NestJS 12 + Fastify 5 API, React + Vite 8 + TanStack + Tailwind/shadcn web app, Docker Compose, GitHub Actions CI, quality gates, and agent documentation.

**Architecture:** A pnpm workspace orchestrated by Turborepo with two apps (`apps/api`, `apps/web`), three internal packages (`packages/tsconfig`, `packages/db`, `packages/shared`), and top-level Playwright e2e tests (`e2e/`). Database schemas defined in `packages/db` drive Zod validation schemas in `packages/shared` (via `drizzle-orm/zod`), which are consumed by both the NestJS 12 API (Standard Schema validation, Fastify 5, Swagger, Pino) and the Vite 8 React frontend (TanStack Router/Query, typed fetch client, Tailwind v4 + shadcn/ui).

**Tech Stack:** pnpm 10.33, Turborepo 2.11, TypeScript 7.0 (strict, ESM), Biome 2.6, knip 6.48, Vitest 5.1, Testcontainers 12.2, Playwright 1.65, Drizzle ORM/Kit `1.0.0-rc.6`, `postgres` 4.1, Zod 4.6, NestJS 12.6 + Fastify 5.12, `@nestjs/swagger` 12.1, `nestjs-pino` 5.3, React 19.3, Vite 8.4 (`@vitejs/plugin-react` 6.3), TanStack Router 1.170 / Query 5.108, Tailwind CSS 4.3, Husky 9.1, lint-staged 17.6, commitlint 21.2.

**Spec:** [starter.md](file:///c:/Users/Christian/accounting/starter.md)

## Global Constraints

- Always use the latest stable version of every dependency (verified against npm registry on 2026-11-27; pinned via `pnpm-lock.yaml`).
- Exception: install `drizzle-orm@rc` and `drizzle-kit@rc` (`1.0.0-rc.6`) together; if RC breaks, fall back to the last stable 0.x and report it.
- Node: Active LTS (`>=22.12.0`, `.nvmrc` set to `24` matching installed `v24.14.1`). ESM everywhere (`"type": "module"`).
- TypeScript `strict: true` everywhere. ESM only.
- No hardcoded secrets. All config via Zod-validated env vars.
- Prefer 1–2 helper functions over many tiny abstractions; no speculative abstractions or unused boilerplate.
- Every phase must pass `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` (via `pnpm check`) before moving on.
- Package scope: `@starter/*` (`@starter/tsconfig`, `@starter/db`, `@starter/shared`, `@starter/api`, `@starter/web`).
- Windows PowerShell note: invoke `pnpm.cmd` when PowerShell execution policy blocks `pnpm.ps1`.

## Review Focus

1. **Missing/invalid environment variables at startup:** `apps/api` and `apps/web` must fail fast with a clear Zod validation error instead of silently falling back to hardcoded credentials or `undefined` URLs.
2. **Duplicate user email (`POST /users`) and non-existent user ID (`GET/PATCH/DELETE /users/:id`):** API must map Postgres unique-constraint violations to `409 Conflict` and missing records to `404 Not Found` via the global exception filter / service, not leak raw `500` stack traces.
3. **Invalid request payloads and route params (malformed email, empty name, invalid UUID):** NestJS 12 Standard Schema validation (or `nestjs-zod` fallback) must reject with `400 Bad Request` and structured error details before touching the database.
4. **Database connection / graceful shutdown:** `apps/api` must enable shutdown hooks and close the `postgres` client on `SIGTERM`/`SIGINT` / `OnApplicationShutdown` so connections don't leak in dev, CI, or Testcontainers runs.
5. **Cross-package ESM resolution and dead-code cleanliness:** Workspace imports (`@starter/db`, `@starter/shared`) must resolve cleanly in `tsc`, Vitest, Vite, and Node runtime, and `knip` + `biome` must pass with zero warnings/unused exports.

---

### Task 1: Root Workspace, Turborepo, Shared TSConfig, Biome, knip

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `biome.json`
- Create: `knip.json`
- Create: `.editorconfig`
- Create: `.gitignore`
- Create: `.nvmrc`
- Create: `packages/tsconfig/package.json`
- Create: `packages/tsconfig/base.json`
- Create: `packages/tsconfig/node.json`
- Create: `packages/tsconfig/react.json`

**Interfaces:**
- Produces:
  - Root scripts: `dev`, `build`, `lint`, `format`, `typecheck`, `test`, `check` (`pnpm lint && pnpm typecheck && pnpm test && pnpm build`), `knip`, `db:generate`, `db:migrate`, `db:studio`.
  - Shared TSConfig presets: `@starter/tsconfig/base.json`, `@starter/tsconfig/node.json`, `@starter/tsconfig/react.json`.

- [ ] **Step 1: Initialize git repository on a feature branch or `main`**
  Run: `git init -b main`
  Expected: Initialized empty Git repository in `c:/Users/Christian/accounting/.git/`.

- [ ] **Step 2: Create root config files and `packages/tsconfig`**
  - `package.json`: `"name": "starter-monorepo"`, `"private": true`, `"type": "module"`, `"packageManager": "pnpm@10.33.0"`, `"engines": { "node": ">=22.12.0" }`, root scripts (`dev`, `build`, `lint`, `format`, `typecheck`, `test`, `knip`, `check`, `db:*`), devDependencies (`turbo`, `typescript`, `@biomejs/biome`, `knip`, `vitest`).
  - `pnpm-workspace.yaml`: `packages: ["apps/*", "packages/*"]`.
  - `turbo.json`: tasks `build` (`dependsOn: ["^build"]`, `outputs: ["dist/**"]`), `lint`, `typecheck` (`dependsOn: ["^build"]`), `test` (`dependsOn: ["^build"]`), `dev` (`cache: false`, `persistent: true`).
  - `biome.json`: Biome 2.x schema, formatter + linter enabled, VCS git integration, ignoring `dist`, `node_modules`, `routeTree.gen.ts`, `drizzle`.
  - `knip.json`: workspace entries configured for root, `packages/*`, `apps/*`.
  - `.nvmrc`: `24`, `.editorconfig`: UTF-8, LF, 2-space indent, `.gitignore`: Node/pnpm/Turbo/Vite/Playwright/env artifacts.
  - `packages/tsconfig/{base,node,react}.json`: `strict: true`, `module: "NodeNext"` / `"ESNext"`, `moduleResolution: "NodeNext"` / `"Bundler"`, `verbatimModuleSyntax: true`, `isolatedModules: true`, `noUncheckedIndexedAccess: true`.

- [ ] **Step 3: Install root dependencies**
  Run: `pnpm.cmd install`
  Expected: `pnpm-lock.yaml` created, exit 0.

- [ ] **Step 4: Verify Phase 1 gates**
  Run: `pnpm.cmd check` and `pnpm.cmd knip`
  Expected: Exit 0 with no lint, typecheck, test, build, or knip errors.

- [ ] **Step 5: Commit**
  Run: `git add -A && git commit -m "chore: initialize root monorepo workspace and shared tooling"`

---

### Task 2: `packages/db` (Drizzle v1 RC + PostgreSQL)

**Files:**
- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Create: `packages/db/drizzle.config.ts`
- Create: `packages/db/src/schema/users.ts`
- Create: `packages/db/src/schema/index.ts`
- Create: `packages/db/src/client.ts`
- Create: `packages/db/src/index.ts`
- Test: `packages/db/src/schema/users.test.ts`

**Interfaces:**
- Consumes: `@starter/tsconfig/node.json`.
- Produces (`@starter/db`):
  - `users` Drizzle `pgTable` (`id: uuid primaryKey defaultRandom`, `email: text notNull unique`, `name: text notNull`, `createdAt: timestamp defaultNow notNull`, `updatedAt: timestamp defaultNow notNull`).
  - `schema` namespace export (`* as schema`).
  - `createDb(databaseUrl: string): { db: Database; client: Sql }` and `type Database`.
  - Scripts: `db:generate`, `db:migrate`, `db:studio`, `build`, `typecheck`, `test`.

- [ ] **Step 1: Scaffold `packages/db/package.json` and `tsconfig.json`**
  Dependencies: `drizzle-orm@1.0.0-rc.6`, `postgres@4.1.1`. DevDependencies: `drizzle-kit@1.0.0-rc.6`, `@starter/tsconfig`, `typescript`, `vitest`. Export `./dist/index.js` + types.

- [ ] **Step 2: Write failing unit test `packages/db/src/schema/users.test.ts`**
  Assert `users` table name is `"users"`, has columns `id`, `email`, `name`, `createdAt`, `updatedAt`, and `createDb` throws when given an empty connection string.

- [ ] **Step 3: Run test to verify it fails**
  Run: `pnpm.cmd --filter @starter/db test`
  Expected: FAIL (missing `src/schema/users.ts` / `src/client.ts`).

- [ ] **Step 4: Implement `users.ts`, `schema/index.ts`, `client.ts`, `index.ts`, `drizzle.config.ts`**
  Implement `users` table, `createDb(databaseUrl)` using `postgres` + `drizzle(client, { schema })` (validating non-empty `databaseUrl`), and `drizzle.config.ts` pointing at `./src/schema/index.ts` and `./drizzle`.

- [ ] **Step 5: Generate initial SQL migration and run `drizzle-kit skills`**
  Run: `pnpm.cmd --filter @starter/db db:generate` and `pnpm.cmd --filter @starter/db exec drizzle-kit skills` (if `skills` subcommand exists in `1.0.0-rc.6`; record ruling if CLI flag differs).
  Expected: Initial migration generated under `packages/db/drizzle/`.

- [ ] **Step 6: Verify Phase 2 gates**
  Run: `pnpm.cmd check`
  Expected: All lint, typecheck, test, and build checks pass.

- [ ] **Step 7: Commit**
  Run: `git add -A && git commit -m "feat(db): add Drizzle v1 schema, client, and migration setup"`

---

### Task 3: `packages/shared` (Zod Schemas & DTO Types)

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/schemas/user.ts`
- Create: `packages/shared/src/index.ts`
- Test: `packages/shared/src/schemas/user.test.ts`

**Interfaces:**
- Consumes: `@starter/db` (`users`), `drizzle-orm/zod`, `zod`.
- Produces (`@starter/shared`):
  - `userSchema` (derived via `createSelectSchema(users)`).
  - `createUserSchema` (derived via `createInsertSchema(users)` picking `email` (trimmed, valid email) and `name` (trimmed, min 1, max 120)).
  - `updateUserSchema` (`createUserSchema.partial()` requiring at least one field).
  - `userIdParamSchema` (`z.object({ id: z.uuid() })`).
  - Types: `User`, `CreateUserDto`, `UpdateUserDto`, `UserIdParam`.

- [ ] **Step 1: Scaffold `packages/shared/package.json` and `tsconfig.json`**
  Dependencies: `@starter/db`, `drizzle-orm`, `zod`.

- [ ] **Step 2: Write failing unit tests in `packages/shared/src/schemas/user.test.ts`**
  Cover valid creation/update/UUID param, plus Review Focus #3 inputs: malformed email, empty/whitespace name, invalid UUID, empty update object.

- [ ] **Step 3: Run test to verify it fails**
  Run: `pnpm.cmd --filter @starter/shared test`
  Expected: FAIL (missing `src/schemas/user.ts`).

- [ ] **Step 4: Implement `packages/shared/src/schemas/user.ts` and `src/index.ts`**
  Use `drizzle-orm/zod` (`createSelectSchema`, `createInsertSchema`) with Zod 4 refinements for email/name and UUID param validation.

- [ ] **Step 5: Verify Phase 3 gates**
  Run: `pnpm.cmd check`
  Expected: All tests, lint, typecheck, and build pass.

- [ ] **Step 6: Commit**
  Run: `git add -A && git commit -m "feat(shared): add Zod user schemas and DTO types"`

---

### Task 4: `apps/api` (NestJS 12 ESM + Fastify 5 + Swagger + Pino + Testcontainers)

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/vitest.config.ts`
- Create: `apps/api/src/main.ts`
- Create: `apps/api/src/app.module.ts`
- Create: `apps/api/src/config/env.ts`
- Create: `apps/api/src/config/config.module.ts`
- Create: `apps/api/src/database/database.module.ts`
- Create: `apps/api/src/common/filters/http-exception.filter.ts`
- Create: `apps/api/src/health/health.controller.ts`
- Create: `apps/api/src/health/health.module.ts`
- Create: `apps/api/src/users/users.controller.ts`
- Create: `apps/api/src/users/users.service.ts`
- Create: `apps/api/src/users/users.module.ts`
- Test: `apps/api/src/config/env.test.ts`
- Test: `apps/api/src/users/users.service.test.ts`
- Test: `apps/api/src/users/users.integration.test.ts`

**Interfaces:**
- Consumes: `@starter/db` (`createDb`, `users`, `Database`), `@starter/shared` (`createUserSchema`, `updateUserSchema`, `userIdParamSchema`, `CreateUserDto`, `UpdateUserDto`, `User`).
- Produces (HTTP API):
  - `GET /health` -> `200 { status: "ok", timestamp: string }`
  - `GET /docs` -> Swagger UI (OpenAPI)
  - `GET /users` -> `200 User[]`
  - `GET /users/:id` -> `200 User` | `400` | `404`
  - `POST /users` -> `201 User` | `400` | `409`
  - `PATCH /users/:id` -> `200 User` | `400` | `404` | `409`
  - `DELETE /users/:id` -> `204` | `400` | `404`

- [ ] **Step 1: Scaffold `apps/api/package.json`, `tsconfig.json`, `vitest.config.ts`**
  Dependencies: `@nestjs/core`, `@nestjs/common`, `@nestjs/platform-fastify`, `@nestjs/swagger`, `fastify`, `@fastify/helmet`, `@fastify/cors`, `nestjs-pino`, `pino`, `pino-http`, `reflect-metadata`, `rxjs`, `zod`, `@starter/db`, `@starter/shared`.
  DevDependencies: `@nestjs/testing`, `pino-pretty`, `tsx`, `@testcontainers/postgresql`, `testcontainers`, `vitest`, `@types/node`.
  Note: NestJS decorators require `experimentalDecorators: true` and `emitDecoratorMetadata: true` in `apps/api/tsconfig.json`.

- [ ] **Step 2: Write failing unit tests for env validation (`env.test.ts`) and users service (`users.service.test.ts`)**
  Cover Review Focus #1 (missing `DATABASE_URL` or invalid `PORT` throws ZodError) and Review Focus #2 (404 on missing user, 409 on Postgres unique violation code `23505`).

- [ ] **Step 3: Run unit tests to verify they fail**
  Run: `pnpm.cmd --filter @starter/api test`
  Expected: FAIL (modules not implemented yet).

- [ ] **Step 4: Implement `config`, `database` (with `OnApplicationShutdown` closing `client.end()`), `http-exception.filter.ts`, `health`, `users`, `app.module.ts`, and `main.ts`**
  - Use NestJS 12 Standard Schema validation in `@Body/@Query/@Param` (fall back to `nestjs-zod` only if Nest 12 Standard Schema does not support it directly; record ruling if needed).
  - Register `@fastify/helmet`, `@fastify/cors`, global exception filter, Pino logger (`nestjs-pino`), Swagger at `/docs`, `app.enableShutdownHooks()`.

- [ ] **Step 5: Write Testcontainers integration test `apps/api/src/users/users.integration.test.ts`**
  Spin up `@testcontainers/postgresql`, run Drizzle migrations against it, boot Nest Fastify app via `@nestjs/testing`, and test `GET /health`, `POST /users`, duplicate email `409`, invalid payload `400`, `GET /users`, `GET /users/:id`, `PATCH /users/:id`, `DELETE /users/:id`, and `404` after delete.

- [ ] **Step 6: Verify Phase 4 gates**
  Run: `pnpm.cmd check`
  Expected: Unit + Testcontainers integration tests, lint, typecheck, and build all pass.

- [ ] **Step 7: Commit**
  Run: `git add -A && git commit -m "feat(api): add NestJS 12 Fastify API with health, users CRUD, Swagger, and Pino"`

---

### Task 5: `apps/web` (Vite 8 + React 19 + TanStack Router/Query + Tailwind v4 + shadcn/ui)

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/index.html`
- Create: `apps/web/components.json`
- Create: `apps/web/src/env.ts`
- Create: `apps/web/src/lib/utils.ts`
- Create: `apps/web/src/lib/api.ts`
- Create: `apps/web/src/components/ui/button.tsx`
- Create: `apps/web/src/components/ui/input.tsx`
- Create: `apps/web/src/components/ui/card.tsx`
- Create: `apps/web/src/routes/root.tsx`
- Create: `apps/web/src/routes/users.tsx`
- Create: `apps/web/src/router.tsx`
- Create: `apps/web/src/index.css`
- Create: `apps/web/src/main.tsx`
- Test: `apps/web/src/env.test.ts`
- Test: `apps/web/src/routes/users.test.tsx`

**Interfaces:**
- Consumes: `@starter/shared` (`createUserSchema`, `User`, `CreateUserDto`), API endpoints `/api/health`, `/api/users` (proxied to `http://localhost:3001` in Vite dev).
- Produces: Web app serving `/` (Users page: list users, create user form with client-side Zod validation, delete user, error display for API 400/409).

- [ ] **Step 1: Scaffold `apps/web/package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `components.json`**
  Dependencies: `react`, `react-dom`, `@tanstack/react-router`, `@tanstack/react-query`, `clsx`, `tailwind-merge`, `class-variance-authority`, `lucide-react`, `zod`, `@starter/shared`.
  DevDependencies: `vite`, `@vitejs/plugin-react`, `tailwindcss`, `@tailwindcss/vite`, `@types/react`, `@types/react-dom`, `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`.
  Configure Vite proxy `/api` -> `VITE_API_TARGET` (default `http://localhost:3001`, stripping `/api` prefix).

- [ ] **Step 2: Write failing tests `env.test.ts` and `users.test.tsx`**
  - `env.test.ts`: validates `import.meta.env` parsing (Review Focus #1).
  - `users.test.tsx`: renders users list from mocked API, submits create user form, displays validation error on invalid email.

- [ ] **Step 3: Run tests to verify they fail**
  Run: `pnpm.cmd --filter @starter/web test`
  Expected: FAIL (components/env not created yet).

- [ ] **Step 4: Implement `env.ts`, `lib/utils.ts`, `lib/api.ts`, shadcn/ui primitives (`button`, `input`, `card`), TanStack Router + Query setup, and `users.tsx` page**

- [ ] **Step 5: Verify Phase 5 gates**
  Run: `pnpm.cmd check`
  Expected: Web tests, API tests, lint, typecheck, and Vite production build all pass.

- [ ] **Step 6: Commit**
  Run: `git add -A && git commit -m "feat(web): add Vite 8 React app with TanStack, Tailwind, shadcn/ui, and users page"`

---

### Task 6: Infrastructure (`docker-compose.yml`, `.env.example`, GitHub Actions CI, `README.md`)

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `.github/workflows/ci.yml`
- Create: `README.md`

**Interfaces:**
- Produces:
  - Postgres 17 Alpine service with named volume (`pgdata`) and `pg_isready` healthcheck on port `5432`.
  - `.env.example` documenting `DATABASE_URL`, `PORT`, `CORS_ORIGIN`, `LOG_LEVEL`, `VITE_API_URL`.
  - `.github/workflows/ci.yml` running `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` with pnpm store + Turborepo cache.
  - `README.md` quick-start strictly under 20 lines.

- [ ] **Step 1: Create `docker-compose.yml`, `.env.example`, `.github/workflows/ci.yml`, and `README.md`**
- [ ] **Step 2: Validate `docker-compose.yml` syntax and run `pnpm.cmd check`**
  Run: `docker compose config --quiet && pnpm.cmd check`
  Expected: Exit 0.
- [ ] **Step 3: Commit**
  Run: `git add -A && git commit -m "chore(infra): add Docker Compose, env template, CI workflow, and README"`

---

### Task 7: Quality Gates (Husky, lint-staged, commitlint, Playwright E2E)

**Files:**
- Create: `.husky/pre-commit`
- Create: `.husky/commit-msg`
- Create: `commitlint.config.js`
- Create: `playwright.config.ts`
- Create: `e2e/smoke.spec.ts`
- Modify: `package.json` (add `prepare`, `lint-staged`, `test:e2e`, devDependencies `husky`, `lint-staged`, `@commitlint/cli`, `@commitlint/config-conventional`, `@playwright/test`)

**Interfaces:**
- Produces:
  - Pre-commit hook running `pnpm exec lint-staged` (`biome check --write`).
  - Commit-msg hook running `pnpm exec commitlint --edit "$1"` (Conventional Commits).
  - Playwright smoke test verifying web loads, creates a user end-to-end against live API + Postgres, and renders it.

- [ ] **Step 1: Add Husky, lint-staged, commitlint, and `@playwright/test` to root `package.json` and install**
  Run: `pnpm.cmd install`
- [ ] **Step 2: Configure `.husky/pre-commit`, `.husky/commit-msg`, `commitlint.config.js`, `playwright.config.ts`, and `e2e/smoke.spec.ts`**
- [ ] **Step 3: Verify commitlint rejects invalid message and accepts conventional message**
  Run: `echo "bad message" | pnpm.cmd exec commitlint` (Expected: FAIL) and `echo "feat: valid message" | pnpm.cmd exec commitlint` (Expected: PASS).
- [ ] **Step 4: Run full stack smoke verification (`docker compose up -d`, `pnpm.cmd db:migrate`, start api+web, verify `/health`, `/docs`, and `pnpm.cmd test:e2e`) and `pnpm.cmd check`**
  Expected: `/health` returns 200, `/docs` loads, Playwright smoke test passes, `pnpm.cmd check` passes.
- [ ] **Step 5: Commit**
  Run: `git add -A && git commit -m "chore(quality): add Husky, lint-staged, commitlint, and Playwright smoke test"`

---

### Task 8: Agent Documentation (`AGENTS.md`, nested `AGENTS.md`, `CLAUDE.md`, `docs/agents/*`)

**Files:**
- Create: `AGENTS.md` (strictly under 100 lines, index of real structure & commands)
- Create: `CLAUDE.md` (`@AGENTS.md`)
- Create: `apps/api/AGENTS.md`
- Create: `apps/web/AGENTS.md`
- Create: `packages/db/AGENTS.md`
- Create: `docs/agents/architecture.md`
- Create: `docs/agents/add-endpoint.md`
- Create: `docs/agents/add-migration.md`
- Create: `docs/agents/add-page.md`
- Create: `docs/agents/decisions/README.md`

**Interfaces:**
- Produces: Up-to-date agent guidance matching the exact commands, file paths, and conventions built in Tasks 1–7, with each recipe in `docs/agents/` ~15 lines.

- [ ] **Step 1: Draft root `AGENTS.md` (<100 lines), `CLAUDE.md` (1 line), nested `AGENTS.md` files, and `docs/agents/` recipes (~15 lines each)**
- [ ] **Step 2: Check Grok `AGENTS.md` convention** (verify whether Grok CLI reads `AGENTS.md` or needs a pointer file; document/add pointer if needed).
- [ ] **Step 3: Final full verification (`pnpm.cmd check` + `pnpm.cmd knip` + line-count checks on `AGENTS.md` and `README.md`)**
  Expected: `pnpm.cmd check` exits 0, `pnpm.cmd knip` exits 0, `AGENTS.md` < 100 lines, `README.md` < 20 lines.
- [ ] **Step 4: Commit**
  Run: `git add -A && git commit -m "docs(agents): add root and nested AGENTS.md files and agent recipes"`
