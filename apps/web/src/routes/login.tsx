import { createFileRoute, redirect } from "@tanstack/react-router";
import { LoginPage } from "@/features/auth/login-page";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/query-client";

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    try {
      const session = await queryClient.fetchQuery({
        queryKey: ["auth", "me"],
        queryFn: api.authMe,
      });
      if (session?.user) {
        throw redirect({ to: "/" });
      }
    } catch (err) {
      if (err && typeof err === "object" && "to" in err) {
        throw err;
      }
    }
  },
  component: LoginPage,
});
