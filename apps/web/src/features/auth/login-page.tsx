import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, registerSchema } from "@starter/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Check, Eye, EyeOff, KeyRound, Layers, Loader2, ShieldCheck, Users } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

type AuthMode = "login" | "register";

interface AuthFormValues {
  name: string;
  email: string;
  password: string;
}

const RBAC_PREVIEW_ROWS = [
  { menu: "Dashboard", view: true, create: false, update: false, del: false },
  { menu: "Employee 201", view: true, create: true, update: true, del: false },
  { menu: "User Management", view: true, create: true, update: true, del: true },
] as const;

export function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<AuthMode>("login");
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const isRegister = mode === "register";

  const form = useForm<AuthFormValues>({
    defaultValues: { name: "", email: "", password: "" },
    resolver: zodResolver(isRegister ? registerSchema : loginSchema) as never,
  });

  const authMutation = useMutation({
    mutationFn: async (values: AuthFormValues) =>
      isRegister
        ? api.register({ name: values.name, email: values.email, password: values.password })
        : api.login({ email: values.email, password: values.password }),
    onSuccess: async (data) => {
      queryClient.setQueryData(["auth", "me"], data);
      setServerError(null);
      await navigate({ to: "/", replace: true });
    },
    onError: (err: Error) => {
      setServerError(err.message);
    },
  });

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setServerError(null);
    form.clearErrors();
  }

  const onSubmit = form.handleSubmit((values) => {
    setServerError(null);
    authMutation.mutate(values);
  });

  const { errors } = form.formState;

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col gap-6 p-6 md:p-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 font-semibold tracking-tight text-foreground">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            </div>
            <span>Astraea HRIS</span>
          </div>
          <span className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
            Workspace Portal
          </span>
        </div>

        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm">
            <div className="mb-8 flex flex-col gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                {isRegister ? "Create your workspace account" : "Sign in to your account"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {isRegister
                  ? "Enter your details below to provision an HRIS account."
                  : "Enter your work email and password to access Astraea HRIS."}
              </p>
            </div>

            {serverError ? (
              <div
                role="alert"
                className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
              >
                {serverError}
              </div>
            ) : null}

            <form onSubmit={onSubmit} noValidate>
              <FieldGroup>
                {isRegister ? (
                  <Field>
                    <FieldLabel htmlFor="auth-name">Full name</FieldLabel>
                    <Input
                      id="auth-name"
                      type="text"
                      autoComplete="name"
                      placeholder="Alex Rivera"
                      aria-invalid={Boolean(errors.name)}
                      aria-describedby={errors.name ? "auth-name-error" : undefined}
                      {...form.register("name")}
                    />
                    <FieldError id="auth-name-error" message={errors.name?.message} />
                  </Field>
                ) : null}

                <Field>
                  <FieldLabel htmlFor="auth-email">Work email</FieldLabel>
                  <Input
                    id="auth-email"
                    type="email"
                    autoComplete="email"
                    placeholder="name@company.com"
                    aria-invalid={Boolean(errors.email)}
                    aria-describedby={errors.email ? "auth-email-error" : undefined}
                    {...form.register("email")}
                  />
                  <FieldError id="auth-email-error" message={errors.email?.message} />
                </Field>

                <Field>
                  <div className="flex items-center justify-between">
                    <FieldLabel htmlFor="auth-password">Password</FieldLabel>
                    {!isRegister ? (
                      <span className="text-xs text-muted-foreground">Min. 8 characters</span>
                    ) : null}
                  </div>
                  <div className="relative">
                    <Input
                      id="auth-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete={isRegister ? "new-password" : "current-password"}
                      placeholder="Enter your password"
                      className="pr-10"
                      aria-invalid={Boolean(errors.password)}
                      aria-describedby={errors.password ? "auth-password-error" : undefined}
                      {...form.register("password")}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0.5 top-0.5 h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      aria-pressed={showPassword}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      )}
                    </Button>
                  </div>
                  <FieldError id="auth-password-error" message={errors.password?.message} />
                  {isRegister ? (
                    <FieldDescription>
                      Use at least 8 characters. Password managers and paste are supported.
                    </FieldDescription>
                  ) : null}
                </Field>

                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={authMutation.isPending}
                >
                  {authMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      <span>{isRegister ? "Creating account..." : "Signing in..."}</span>
                    </>
                  ) : isRegister ? (
                    "Create account"
                  ) : (
                    "Sign in"
                  )}
                </Button>
              </FieldGroup>
            </form>

            <div className="mt-6 text-center text-sm text-muted-foreground">
              {isRegister ? (
                <>
                  Already have an account?{" "}
                  <button
                    type="button"
                    onClick={() => switchMode("login")}
                    className="cursor-pointer font-medium text-foreground underline underline-offset-4 hover:text-primary"
                  >
                    Sign in
                  </button>
                </>
              ) : (
                <>
                  Need an account?{" "}
                  <button
                    type="button"
                    onClick={() => switchMode("register")}
                    className="cursor-pointer font-medium text-foreground underline underline-offset-4 hover:text-primary"
                  >
                    Create account
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground lg:text-left">
          Protected by HTTP-only session authentication and role-based menu access.
        </p>
      </div>

      <div className="relative hidden flex-col justify-between overflow-hidden bg-zinc-950 p-10 text-zinc-50 lg:flex">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,oklch(0.45_0.14_255/0.35),transparent_55%),linear-gradient(to_bottom_right,oklch(0.22_0.04_265),oklch(0.14_0.03_265))]"
        />

        <div className="relative z-10 flex items-center gap-2 text-xs font-medium tracking-wider uppercase text-zinc-300">
          <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Enterprise Access Control</span>
        </div>

        <div className="relative z-10 mx-auto my-auto flex w-full max-w-md flex-col gap-8">
          <div className="space-y-3">
            <h2 className="text-3xl font-semibold leading-tight tracking-tight">
              Centralized people operations with live RBAC enforcement.
            </h2>
            <p className="text-sm leading-relaxed text-zinc-300">
              Every route, navigation item, and API action is governed by a single four-action
              permission matrix — updated instantaneously across active sessions.
            </p>
          </div>

          <div className="rounded-xl border border-white/15 bg-white/5 p-5 backdrop-blur-xs">
            <div className="mb-3 flex items-center justify-between text-xs">
              <span className="font-medium text-white">Role Permission Matrix</span>
              <span className="rounded-md bg-white/10 px-2 py-0.5 font-mono text-[11px] text-zinc-200">
                role: admin
              </span>
            </div>
            <div className="overflow-hidden rounded-lg border border-white/10">
              <table className="w-full text-left text-xs">
                <thead className="bg-white/8 text-zinc-300">
                  <tr>
                    <th className="px-3 py-2 font-medium">Menu</th>
                    <th className="px-2 py-2 text-center font-medium">View</th>
                    <th className="px-2 py-2 text-center font-medium">Create</th>
                    <th className="px-2 py-2 text-center font-medium">Update</th>
                    <th className="px-2 py-2 text-center font-medium">Delete</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {RBAC_PREVIEW_ROWS.map((row) => (
                    <tr key={row.menu}>
                      <td className="px-3 py-2 font-medium text-white">{row.menu}</td>
                      {(["view", "create", "update", "del"] as const).map((action) => (
                        <td key={`${row.menu}-${action}`} className="px-2 py-2 text-center">
                          {row[action] ? (
                            <span className="inline-flex h-4 w-4 items-center justify-center rounded-sm bg-emerald-400/20 text-emerald-300">
                              <Check className="h-3 w-3" aria-hidden="true" />
                            </span>
                          ) : (
                            <span className="text-white/30">—</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs text-zinc-300">
            <div className="flex items-start gap-2.5">
              <Layers className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" aria-hidden="true" />
              <div>
                <p className="font-medium text-white">Dynamic Menu Tree</p>
                <p className="mt-0.5 text-zinc-400">
                  Auto-prunes unauthorized routes and empty sections.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Users className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" aria-hidden="true" />
              <div>
                <p className="font-medium text-white">Session-Backed Auth</p>
                <p className="mt-0.5 text-zinc-400">
                  HTTP-only cookies with instant role revocation.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 text-xs text-zinc-400">
          Astraea HRIS &middot; NestJS 12 + React 19 + Drizzle
        </div>
      </div>
    </div>
  );
}
