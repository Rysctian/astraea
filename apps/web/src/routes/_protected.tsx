import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createFileRoute,
  Outlet,
  redirect,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/query-client";

function resolvePageTitle(pathname: string): string {
  if (pathname.startsWith("/employees/")) {
    return `Employee 201 / ${pathname.replace("/employees/", "")}`;
  }
  if (pathname === "/employees") {
    return "Employee 201";
  }
  if (pathname === "/organization") {
    return "Organizational Setup";
  }
  if (pathname === "/setup/employee-info") {
    return "Reference Setup / Employee Information";
  }
  if (pathname === "/setup/employment") {
    return "Reference Setup / Employment";
  }
  if (pathname === "/setup/administrative") {
    return "Reference Setup / Administrative";
  }
  return "Users";
}

export const Route = createFileRoute("/_protected")({
  beforeLoad: async () => {
    try {
      const session = await queryClient.ensureQueryData({
        queryKey: ["auth", "me"],
        queryFn: api.authMe,
      });
      if (!session?.user) {
        throw redirect({ to: "/login" });
      }
      return { user: session.user };
    } catch (err) {
      if (err && typeof err === "object" && "to" in err) {
        throw err;
      }
      throw redirect({ to: "/login" });
    }
  },
  component: ProtectedLayout,
});

function ProtectedLayout() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  const logoutMutation = useMutation({
    mutationFn: api.logout,
    onSuccess: async () => {
      qc.removeQueries({ queryKey: ["auth", "me"] });
      await navigate({ to: "/login", replace: true });
    },
  });

  return (
    <AppShell
      user={user}
      onSignOut={() => logoutMutation.mutate()}
      isSigningOut={logoutMutation.isPending}
      currentPath={pathname}
      pageTitle={resolvePageTitle(pathname)}
    >
      <Outlet />
    </AppShell>
  );
}
