# apps/web — Agent Rules

- React 19 + Vite 8 + Tailwind CSS 4 + shadcn/ui primitives under `src/components/ui/`.
- Frontend layout:
  - `src/routes/` — thin, flat dot-named TanStack Router file routes + generated `src/routeTree.gen.ts`.
  - `src/features/<domain>/` — one folder per domain with flat files inside (`*-table.tsx`, `*-create.tsx`, `*-detail-page.tsx`, `*-utils.ts`).
  - `src/components/` — shared layout (`app-shell.tsx`) and `ui/` primitives (use shadcn `Drawer` via `vaul`, `ServerDataTable` via TanStack Table v9).
  - `src/lib/` — `api.ts`, `query-client.ts`, `workspace-actions.tsx`, `utils.ts`.
- Use React Hook Form (`useForm` + `zodResolver`) with `@starter/shared` Zod schemas for all forms; use `noValidate` on `<form>`.
- Avoid `useEffect` for redirects, form syncing, or cross-component events — use TanStack Router `beforeLoad`, RHF `values`, and React context instead.
- All tables must use `ServerDataTable` (`@tanstack/react-table` v9) with server-side pagination, sorting, and filtering.
- Validate any new `VITE_*` env var in `src/env.ts` and add a unit test in `src/env.test.ts`.
