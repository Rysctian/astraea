import { z } from "zod";

const webEnvSchema = z.object({
  VITE_API_URL: z.string().min(1, "VITE_API_URL must not be empty").default("/api"),
});

export type WebEnv = z.infer<typeof webEnvSchema>;

export function parseWebEnv(raw: Record<string, unknown>): WebEnv {
  return webEnvSchema.parse(raw);
}

export const webEnv = parseWebEnv(import.meta.env);
