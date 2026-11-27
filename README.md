# Starter Monorepo

TypeScript ESM monorepo with pnpm, Turborepo, NestJS 12 + Fastify 5, Drizzle v1 + PostgreSQL, and React 19 + Vite 8.

## Quick Start

```bash
cp .env.example .env
pnpm install
docker compose up -d
pnpm db:migrate
pnpm dev
```

- Web: `http://localhost:5173`
- API health: `http://localhost:3001/health`
- Swagger docs: `http://localhost:3001/docs`
- Full checks: `pnpm check`
