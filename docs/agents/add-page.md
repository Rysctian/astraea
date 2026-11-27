# Recipe: Add a Web Page

1. Add typed API helper functions in `apps/web/src/lib/api.ts` using DTO types from `@starter/shared`.
2. Create the page component in `apps/web/src/routes/<page>.tsx` using TanStack Query (`useQuery`/`useMutation`) and `src/components/ui/*` primitives.
3. Register the route in `apps/web/src/router.tsx` and add a `<Link>` in `apps/web/src/routes/root.tsx` if needed.
4. Add a Vitest + Testing Library test in `apps/web/src/routes/<page>.test.tsx`.
5. Run `pnpm check` to verify lint, typecheck, unit tests, and the Vite production build.
